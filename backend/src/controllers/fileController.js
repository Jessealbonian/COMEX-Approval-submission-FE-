'use strict';

const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');
const env = require('../config/env');
const HttpError = require('../utils/httpError');
const { ROLES, roleName } = require('../utils/roles');
const { STATUS } = require('../utils/status');
const {
  requireString,
  optionalString,
  requireId,
} = require('../utils/validate');
const logger = require('../utils/logger');

/**
 * Returns a SQL fragment + params describing which files the given role
 * is allowed to see. Enforced at the DB query level so a misbehaving
 * frontend cannot escalate visibility.
 *
 *   Teacher (1)     -> only files they uploaded
 *   Coordinator (2) -> files routed at level >= 2
 *   Master (3)      -> files routed at level >= 3
 *   Admin (4)       -> all files
 */
function visibilityClause(user) {
  switch (Number(user.role_level)) {
    case ROLES.TEACHER:
      return { sql: 'f.uploaded_by = ?', params: [user.id] };
    case ROLES.COORDINATOR:
      return { sql: 'f.current_level >= ?', params: [ROLES.COORDINATOR] };
    case ROLES.MASTER:
      return { sql: 'f.current_level >= ?', params: [ROLES.MASTER] };
    case ROLES.ADMIN:
      return { sql: '1=1', params: [] };
    default:
      return { sql: '1=0', params: [] };
  }
}

function shapeFile(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    original_name: row.original_name,
    mime_type: row.mime_type,
    size_bytes: Number(row.size_bytes),
    current_level: row.current_level,
    current_role: roleName(row.current_level),
    status: row.status,
    uploaded_by: {
      id: row.uploaded_by,
      name: row.uploader_name,
      email: row.uploader_email,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const FILE_SELECT = `
  SELECT f.id, f.title, f.description, f.original_name, f.stored_name,
         f.mime_type, f.size_bytes, f.current_level, f.status,
         f.uploaded_by, f.created_at, f.updated_at,
         u.name  AS uploader_name,
         u.email AS uploader_email
    FROM files f
    JOIN users u ON u.id = f.uploaded_by
`;

/**
 * POST /api/files (Teacher only) - multipart/form-data
 * fields: title (string, required), description (string, optional), file (PDF)
 */
async function uploadFile(req, res, next) {
  try {
    if (!req.file) throw new HttpError(400, 'PDF file is required');

    let title;
    let description;
    try {
      title = requireString(req.body && req.body.title, 'title', { min: 2, max: 255 });
      description = optionalString(req.body && req.body.description, 'description', {
        max: 4000,
      });
    } catch (e) {
      fs.unlink(req.file.path, () => {});
      throw e;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        `INSERT INTO files
          (uploaded_by, title, description, original_name, stored_name,
           mime_type, size_bytes, current_level, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          title,
          description,
          req.file.originalname.slice(0, 255),
          req.file.filename,
          'application/pdf',
          req.file.size,
          ROLES.COORDINATOR,
          STATUS.UPLOADED,
        ]
      );

      await conn.commit();

      const [rows] = await pool.query(
        `${FILE_SELECT} WHERE f.id = ? LIMIT 1`,
        [result.insertId]
      );

      logger.info('files.upload', {
        reqId: req.id,
        actor: req.user.id,
        fileId: result.insertId,
        size: req.file.size,
      });

      res.status(201).json({ file: shapeFile(rows[0]) });
    } catch (e) {
      await conn.rollback();
      fs.unlink(req.file.path, () => {});
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/files
 * Optional filters: ?status=&current_level=&mine=1
 */
async function listFiles(req, res, next) {
  try {
    const where = [];
    const params = [];

    const vis = visibilityClause(req.user);
    where.push(vis.sql);
    params.push(...vis.params);

    if (req.query.status) {
      const allowed = Object.values(STATUS);
      const status = String(req.query.status);
      if (!allowed.includes(status)) {
        throw new HttpError(400, 'Invalid status filter');
      }
      where.push('f.status = ?');
      params.push(status);
    }
    if (req.query.current_level) {
      const lvl = Number(req.query.current_level);
      if (![1, 2, 3, 4].includes(lvl)) {
        throw new HttpError(400, 'Invalid current_level filter');
      }
      where.push('f.current_level = ?');
      params.push(lvl);
    }
    if (req.query.mine === '1') {
      where.push('f.uploaded_by = ?');
      params.push(req.user.id);
    }
    // ?history=1 returns files that have already moved past the
    // requesting reviewer's stage, OR are finalized. Used by the
    // Coordinator/Master "History" tab. Teachers and Admin get the
    // unfiltered list because they don't have a "stage" of their own.
    if (req.query.history === '1') {
      const lvl = Number(req.user.role_level);
      if (lvl === ROLES.COORDINATOR || lvl === ROLES.MASTER) {
        where.push('(f.current_level > ? OR f.status = ?)');
        params.push(lvl, STATUS.FINALIZED);
      }
    }

    const sql = `${FILE_SELECT}
      WHERE ${where.join(' AND ')}
      ORDER BY f.updated_at DESC, f.id DESC
      LIMIT 500`;
    const [rows] = await pool.query(sql, params);

    res.json({ files: rows.map(shapeFile) });
  } catch (err) {
    next(err);
  }
}

/**
 * Loads a file row and verifies the requesting user can view it.
 * Throws 404 if not found, 403 if not visible.
 */
async function loadVisibleFile(user, fileId) {
  const [rows] = await pool.query(`${FILE_SELECT} WHERE f.id = ? LIMIT 1`, [
    fileId,
  ]);
  const row = rows[0];
  if (!row) throw new HttpError(404, 'File not found');

  const level = Number(user.role_level);
  if (level === ROLES.TEACHER && row.uploaded_by !== user.id) {
    throw new HttpError(403, 'Forbidden');
  }
  if (level === ROLES.COORDINATOR && row.current_level < ROLES.COORDINATOR) {
    throw new HttpError(403, 'Forbidden');
  }
  if (level === ROLES.MASTER && row.current_level < ROLES.MASTER) {
    throw new HttpError(403, 'Forbidden');
  }
  return row;
}

/**
 * GET /api/files/:id - returns metadata + comments timeline.
 */
async function getFile(req, res, next) {
  try {
    const id = requireId(req.params.id);
    const row = await loadVisibleFile(req.user, id);

    const [comments] = await pool.query(
      `SELECT c.id, c.file_id, c.user_id, c.role_level, c.action, c.body,
              c.resolved_at, c.resolved_by, c.created_at,
              u.name  AS user_name,
              u.email AS user_email,
              ru.id   AS resolver_id,
              ru.name AS resolver_name
         FROM comments c
         JOIN users u ON u.id = c.user_id
         LEFT JOIN users ru ON ru.id = c.resolved_by
        WHERE c.file_id = ?
        ORDER BY c.created_at ASC, c.id ASC`,
      [id]
    );

    res.json({
      file: shapeFile(row),
      comments: comments.map((c) => ({
        id: c.id,
        file_id: c.file_id,
        action: c.action,
        body: c.body,
        role_level: c.role_level,
        role: roleName(c.role_level),
        user: { id: c.user_id, name: c.user_name, email: c.user_email },
        resolved_at: c.resolved_at,
        resolved_by: c.resolver_id
          ? { id: c.resolver_id, name: c.resolver_name }
          : null,
        created_at: c.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/files/:id/download - streams the stored PDF.
 *
 * The stored filename is generated server-side from random bytes, so
 * path-traversal via the URL is impossible. We additionally normalize
 * the path and ensure it stays under env.uploads.dir as defense in depth.
 */
async function downloadFile(req, res, next) {
  try {
    const id = requireId(req.params.id);
    const row = await loadVisibleFile(req.user, id);

    const absPath = path.join(env.uploads.dir, row.stored_name);
    const normalized = path.normalize(absPath);
    if (!normalized.startsWith(env.uploads.dir)) {
      throw new HttpError(400, 'Invalid stored path');
    }
    if (!fs.existsSync(normalized)) {
      throw new HttpError(410, 'Stored file is missing on disk');
    }

    const safeName = encodeURIComponent(row.original_name).slice(0, 240);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    fs.createReadStream(normalized).pipe(res);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadFile,
  listFiles,
  getFile,
  downloadFile,
  loadVisibleFile,
  shapeFile,
};
