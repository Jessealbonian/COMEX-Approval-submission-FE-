'use strict';

/**
 * Runs sql/schema.sql against the MySQL server, then applies any
 * additive migrations (idempotent ALTER TABLE statements) so that
 * upgrading an existing database picks up new columns without losing
 * data.
 *
 * Usage: npm run db:init
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const env = require('../config/env');

const ADDITIVE_MIGRATIONS = [
  // Per-level rank (1–7) for teachers/coordinators/masters; NULL for principals.
  `ALTER TABLE \`users\`
     ADD COLUMN \`teacher_rank\` TINYINT UNSIGNED NULL
     AFTER \`role_level\``,
  `ALTER TABLE \`users\`
     ADD COLUMN \`mobile_phone\` VARCHAR(40) NULL
     AFTER \`teacher_rank\``,
  `ALTER TABLE \`users\`
     ADD COLUMN \`telephone\` VARCHAR(40) NULL
     AFTER \`mobile_phone\``,
  `ALTER TABLE \`users\`
     ADD COLUMN \`address\` TEXT NULL
     AFTER \`telephone\``,
  `ALTER TABLE \`users\`
     ADD COLUMN \`department_subject\` VARCHAR(255) NULL
     AFTER \`address\``,
  `ALTER TABLE \`users\`
     ADD COLUMN \`position_title\` VARCHAR(255) NULL
     AFTER \`department_subject\``,
  `ALTER TABLE \`users\`
     ADD COLUMN \`employee_id\` VARCHAR(100) NULL
     AFTER \`position_title\``,
  `ALTER TABLE \`users\`
     ADD COLUMN \`emergency_contact_name\` VARCHAR(150) NULL
     AFTER \`employee_id\``,
  `ALTER TABLE \`users\`
     ADD COLUMN \`emergency_contact_phone\` VARCHAR(40) NULL
     AFTER \`emergency_contact_name\``,
  `ALTER TABLE \`users\`
     ADD COLUMN \`office_room\` VARCHAR(120) NULL
     AFTER \`emergency_contact_phone\``,
  `ALTER TABLE \`users\`
     ADD COLUMN \`work_schedule\` VARCHAR(500) NULL
     AFTER \`office_room\``,
  `ALTER TABLE \`users\`
     ADD COLUMN \`civil_status\` VARCHAR(50) NULL
     AFTER \`work_schedule\``,
  `ALTER TABLE \`users\`
     ADD COLUMN \`nationality\` VARCHAR(100) NULL
     AFTER \`civil_status\``,
  `ALTER TABLE \`users\`
     ADD COLUMN \`notes_other\` TEXT NULL
     AFTER \`nationality\``,
  // token_version was added after the initial schema. Use try/catch on
  // duplicate column to keep this script idempotent.
  `ALTER TABLE \`users\`
     ADD COLUMN \`token_version\` INT UNSIGNED NOT NULL DEFAULT 0
     AFTER \`is_active\``,
  // Document workflow (DLP vs Examination): apply before comment FKs so a
  // duplicate-constraint error later cannot skip these statements.
  `ALTER TABLE \`files\`
     ADD COLUMN \`document_type\` ENUM('dlp','examination') NOT NULL DEFAULT 'dlp' AFTER \`status\``,
  `ALTER TABLE \`files\`
     MODIFY COLUMN \`status\` ENUM(
       'uploaded',
       'reviewed_by_coordinator',
       'reviewed_by_master',
       'finalized',
       'returned',
       'exam_principal',
       'exam_master'
     ) NOT NULL DEFAULT 'uploaded'`,
  // Comment resolution tracking (Resolve button + forward gating).
  `ALTER TABLE \`comments\`
     ADD COLUMN \`resolved_at\` DATETIME NULL AFTER \`body\``,
  `ALTER TABLE \`comments\`
     ADD COLUMN \`resolved_by\` INT UNSIGNED NULL AFTER \`resolved_at\``,
  `ALTER TABLE \`comments\`
     ADD KEY \`ix_comments_resolved_by\` (\`resolved_by\`)`,
  `ALTER TABLE \`comments\`
     ADD CONSTRAINT \`fk_comments_resolved_by\`
       FOREIGN KEY (\`resolved_by\`) REFERENCES \`users\`(\`id\`)
       ON UPDATE CASCADE ON DELETE SET NULL`,
  `ALTER TABLE \`files\`
     ADD COLUMN \`more_details\` TEXT NULL AFTER \`description\``,
  `ALTER TABLE \`files\`
     ADD COLUMN \`custom_type_label\` VARCHAR(255) NULL AFTER \`more_details\``,
  `ALTER TABLE \`files\`
     ADD COLUMN \`custom_route\`
       ENUM('master_only','principal_only','both') NULL AFTER \`custom_type_label\``,
  `ALTER TABLE \`files\`
     MODIFY COLUMN \`document_type\`
       ENUM('dlp','examination','custom') NOT NULL DEFAULT 'dlp'`,
  `ALTER TABLE \`files\`
     ADD COLUMN \`custom_stops\` JSON NULL AFTER \`custom_route\``,
  `UPDATE \`files\` SET \`custom_stops\` = JSON_ARRAY(3)
     WHERE \`document_type\` = 'custom' AND \`custom_stops\` IS NULL AND \`custom_route\` = 'master_only'`,
  `UPDATE \`files\` SET \`custom_stops\` = JSON_ARRAY(4)
     WHERE \`document_type\` = 'custom' AND \`custom_stops\` IS NULL AND \`custom_route\` = 'principal_only'`,
  `UPDATE \`files\` SET \`custom_stops\` = JSON_ARRAY(3,4)
     WHERE \`document_type\` = 'custom' AND \`custom_stops\` IS NULL AND \`custom_route\` = 'both'`,
];

const IGNORABLE_ERROR_CODES = new Set([
  'ER_DUP_FIELDNAME', // column already exists
  'ER_DUP_KEYNAME',   // index already exists
  'ER_TABLE_EXISTS_ERROR',
  'ER_FK_DUP_NAME',   // foreign key already exists
  'ER_DUP_KEY',
]);

function isIgnorableMigrationError(err) {
  if (!err) return false;
  if (IGNORABLE_ERROR_CODES.has(err.code)) return true;
  // MySQL may report duplicate FK / duplicate key as errno 121 (HY000).
  if (Number(err.errno) === 121) return true;
  const msg = String(err.message || err.sqlMessage || '');
  if (/duplicate key on write or update/i.test(msg)) return true;
  if (/duplicate foreign key constraint name/i.test(msg)) return true;
  return false;
}

async function main() {
  const sqlPath = path.resolve(__dirname, '..', '..', 'sql', 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
    console.log('[db:init] schema applied');

    await conn.changeUser({ database: env.db.database });
    for (const stmt of ADDITIVE_MIGRATIONS) {
      try {
        await conn.query(stmt);
        console.log('[db:init] migration applied:', firstLine(stmt));
      } catch (err) {
        if (isIgnorableMigrationError(err)) {
          console.log('[db:init] migration already applied:', firstLine(stmt));
        } else {
          throw err;
        }
      }
    }
  } finally {
    await conn.end();
  }
}

function firstLine(s) {
  return s.trim().split(/\r?\n/)[0];
}

main().catch((err) => {
  console.error('[db:init] failed:', err.message);
  process.exit(1);
});
