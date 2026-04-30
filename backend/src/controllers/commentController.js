'use strict';

const { pool } = require('../config/db');
const HttpError = require('../utils/httpError');
const { ROLES, roleName } = require('../utils/roles');
const { STATUS, nextWorkflowState } = require('../utils/status');
const { requireString, optionalString, requireId } = require('../utils/validate');
const logger = require('../utils/logger');

/**
 * Returns true if the given user is currently allowed to *act* on the file
 * (i.e. add comments / revisions / forward / finalize).
 *
 * Acting permission is based on the file's current_level matching the
 * reviewer's role_level. Teachers cannot act on their own files (they
 * become read-only once submitted). Admin can always act/oversee.
 */
function canActOnFile(user, file) {
  const level = Number(user.role_level);
  const cur = Number(file.current_level);

  if (level === ROLES.ADMIN) return true;
  if (level === ROLES.TEACHER) return false;
  return cur === level;
}

async function loadFileForAction(user, fileId) {
  const [rows] = await pool.query(
    `SELECT id, uploaded_by, current_level, status
       FROM files WHERE id = ? LIMIT 1`,
    [fileId]
  );
  const file = rows[0];
  if (!file) throw new HttpError(404, 'File not found');
  if (!canActOnFile(user, file)) {
    throw new HttpError(403, 'You are not allowed to act on this file right now');
  }
  return file;
}

/**
 * POST /api/files/:id/comments
 * body: { body: string, action?: 'comment' | 'revision' }
 */
async function addComment(req, res, next) {
  try {
    const id = requireId(req.params.id);
    const body = requireString(req.body && req.body.body, 'body', { min: 1, max: 4000 });
    const action = req.body && req.body.action === 'revision' ? 'revision' : 'comment';

    const file = await loadFileForAction(req.user, id);

    const [result] = await pool.query(
      `INSERT INTO comments (file_id, user_id, role_level, action, body)
       VALUES (?, ?, ?, ?, ?)`,
      [file.id, req.user.id, req.user.role_level, action, body]
    );

    logger.info('comments.add', {
      reqId: req.id,
      actor: req.user.id,
      fileId: file.id,
      action,
    });

    res.status(201).json({
      comment: {
        id: result.insertId,
        file_id: file.id,
        user: { id: req.user.id, name: req.user.name, email: req.user.email },
        role_level: req.user.role_level,
        role: roleName(req.user.role_level),
        action,
        body,
        created_at: new Date(),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/files/:id/forward
 * body: { body?: string }
 *
 * Coordinator -> Master -> Admin chain. Wrapped in a transaction with
 * SELECT ... FOR UPDATE so concurrent forwards cannot double-advance
 * the same file.
 */
async function forwardFile(req, res, next) {
  try {
    const id = requireId(req.params.id);
    const note = optionalString(req.body && req.body.body, 'body', { max: 2000 }) || 'Forwarded';

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query(
        `SELECT id, uploaded_by, current_level, status
           FROM files WHERE id = ? FOR UPDATE`,
        [id]
      );
      const file = rows[0];
      if (!file) throw new HttpError(404, 'File not found');
      if (!canActOnFile(req.user, file)) {
        throw new HttpError(403, 'You are not allowed to forward this file');
      }
      if (Number(req.user.role_level) === ROLES.ADMIN) {
        throw new HttpError(400, 'Admin should finalize, not forward');
      }
      if (Number(file.current_level) !== Number(req.user.role_level)) {
        throw new HttpError(400, 'File is not at your level');
      }

      const next = nextWorkflowState(req.user.role_level);
      if (!next) throw new HttpError(400, 'No next state from this role');

      await conn.query(
        `UPDATE files SET current_level = ?, status = ? WHERE id = ?`,
        [next.current_level, next.status, file.id]
      );

      await conn.query(
        `INSERT INTO comments (file_id, user_id, role_level, action, body)
         VALUES (?, ?, ?, 'forward', ?)`,
        [file.id, req.user.id, req.user.role_level, note]
      );

      await conn.commit();

      logger.info('files.forward', {
        reqId: req.id,
        actor: req.user.id,
        fileId: file.id,
        to: next.current_level,
      });

      res.json({
        ok: true,
        file: { id: file.id, status: next.status, current_level: next.current_level },
      });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/files/:id/finalize  (Admin only)
 * body: { body?: string }
 */
async function finalizeFile(req, res, next) {
  try {
    if (Number(req.user.role_level) !== ROLES.ADMIN) {
      throw new HttpError(403, 'Only the Principal/Admin can finalize');
    }
    const id = requireId(req.params.id);
    const note = optionalString(req.body && req.body.body, 'body', { max: 2000 }) || 'Finalized';

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query(
        `SELECT id, current_level, status FROM files WHERE id = ? FOR UPDATE`,
        [id]
      );
      const file = rows[0];
      if (!file) throw new HttpError(404, 'File not found');
      if (file.status === STATUS.FINALIZED) {
        throw new HttpError(409, 'File is already finalized');
      }

      await conn.query(
        `UPDATE files SET current_level = ?, status = ? WHERE id = ?`,
        [ROLES.ADMIN, STATUS.FINALIZED, file.id]
      );

      await conn.query(
        `INSERT INTO comments (file_id, user_id, role_level, action, body)
         VALUES (?, ?, ?, 'finalize', ?)`,
        [file.id, req.user.id, req.user.role_level, note]
      );

      await conn.commit();

      logger.info('files.finalize', {
        reqId: req.id,
        actor: req.user.id,
        fileId: file.id,
      });

      res.json({
        ok: true,
        file: { id: file.id, status: STATUS.FINALIZED, current_level: ROLES.ADMIN },
      });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
}

module.exports = { addComment, forwardFile, finalizeFile };
