'use strict';

const mysql = require('mysql2/promise');
const env = require('./env');

/**
 * Build the MySQL pool config. SSL is opt-in via DB_SSL=true so that
 * remote managed databases (PlanetScale, RDS, Azure, etc.) can be
 * reached securely from the hosted backend without code changes.
 *
 * mysql2 uses parameterized queries (? placeholders) by default, which
 * is our primary defense against SQL injection. Never concatenate user
 * input into a query string anywhere in this codebase.
 */
function buildPoolConfig() {
  const cfg = {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    waitForConnections: true,
    connectionLimit: env.db.connectionLimit,
    queueLimit: 0,
    decimalNumbers: true,
    dateStrings: false,
    multipleStatements: false,
    charset: 'utf8mb4_unicode_ci',
    timezone: 'Z',
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    connectTimeout: 10_000,
  };

  if (env.db.ssl) {
    cfg.ssl = { rejectUnauthorized: env.db.sslRejectUnauthorized };
  }

  return cfg;
}

const pool = mysql.createPool(buildPoolConfig());

async function ping() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

module.exports = { pool, ping };
