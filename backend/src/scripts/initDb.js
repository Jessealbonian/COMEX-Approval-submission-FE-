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
  // token_version was added after the initial schema. Use try/catch on
  // duplicate column to keep this script idempotent.
  `ALTER TABLE \`users\`
     ADD COLUMN \`token_version\` INT UNSIGNED NOT NULL DEFAULT 0
     AFTER \`is_active\``,
];

const IGNORABLE_ERROR_CODES = new Set([
  'ER_DUP_FIELDNAME', // column already exists
  'ER_DUP_KEYNAME',   // index already exists
  'ER_TABLE_EXISTS_ERROR',
]);

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
        if (IGNORABLE_ERROR_CODES.has(err.code)) {
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
