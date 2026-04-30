'use strict';

const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const env = require('../config/env');
const HttpError = require('../utils/httpError');
const { isValidRole, roleName, ROLES } = require('../utils/roles');
const {
  requireString,
  requireEmail,
  requirePassword,
  requireId,
  requireBool,
} = require('../utils/validate');
const logger = require('../utils/logger');

/**
 * POST /api/users  (Admin only)
 * body: { name, email, password, role_level }
 *
 * Creates a Teacher (1), Coordinator (2) or Master (3).
 * Admins cannot create other Admins through this endpoint.
 */
async function createUser(req, res, next) {
  try {
    const body = req.body || {};

    const name = requireString(body.name, 'name', { min: 2, max: 150 });
    const email = requireEmail(body.email);
    const password = requirePassword(body.password);

    if (!isValidRole(body.role_level)) {
      throw new HttpError(400, 'role_level must be 1, 2, 3 or 4');
    }
    const roleLevel = Number(body.role_level);
    if (roleLevel === ROLES.ADMIN) {
      throw new HttpError(403, 'Cannot create another admin through this endpoint');
    }

    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email]
    );
    if (existing.length) {
      throw new HttpError(409, 'A user with that email already exists');
    }

    const hash = await bcrypt.hash(password, env.bcryptRounds);

    const [result] = await pool.query(
      `INSERT INTO users (name, email, password_hash, role_level)
       VALUES (?, ?, ?, ?)`,
      [name, email, hash, roleLevel]
    );

    logger.info('users.create', {
      reqId: req.id,
      actor: req.user.id,
      newUser: result.insertId,
      role: roleName(roleLevel),
    });

    res.status(201).json({
      user: {
        id: result.insertId,
        name,
        email,
        role_level: roleLevel,
        role: roleName(roleLevel),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users  (Admin only)
 * Optional query: ?role_level=1|2|3|4
 */
async function listUsers(req, res, next) {
  try {
    const params = [];
    let where = '';
    if (req.query.role_level !== undefined) {
      if (!isValidRole(req.query.role_level)) {
        throw new HttpError(400, 'Invalid role_level filter');
      }
      where = 'WHERE role_level = ?';
      params.push(Number(req.query.role_level));
    }

    const [rows] = await pool.query(
      `SELECT id, name, email, role_level, is_active, created_at, updated_at
         FROM users ${where}
         ORDER BY role_level ASC, name ASC`,
      params
    );

    res.json({
      users: rows.map((u) => ({ ...u, role: roleName(u.role_level) })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/users/:id/active  (Admin only)
 * body: { is_active: boolean }
 */
async function setUserActive(req, res, next) {
  try {
    const id = requireId(req.params.id);
    const isActive = requireBool(req.body && req.body.is_active, 'is_active');

    const [target] = await pool.query(
      'SELECT id, role_level FROM users WHERE id = ? LIMIT 1',
      [id]
    );
    if (!target.length) throw new HttpError(404, 'User not found');
    if (target[0].role_level === ROLES.ADMIN) {
      throw new HttpError(403, 'Cannot deactivate an admin via this endpoint');
    }

    await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [
      isActive ? 1 : 0,
      id,
    ]);

    logger.info('users.setActive', {
      reqId: req.id,
      actor: req.user.id,
      target: id,
      isActive,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { createUser, listUsers, setUserActive };
