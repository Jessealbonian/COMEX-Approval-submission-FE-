'use strict';

const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const env = require('../config/env');
const HttpError = require('../utils/httpError');
const { isValidRole, roleName, ROLES } = require('../utils/roles');
const {
  requireString,
  optionalString,
  requireEmail,
  requirePassword,
  requireId,
  requireBool,
} = require('../utils/validate');
const logger = require('../utils/logger');

const USER_ROW_SELECT = `
  id, name, email, role_level, is_active,
  teacher_rank,
  mobile_phone, telephone, address, department_subject, position_title, employee_id,
  emergency_contact_name, emergency_contact_phone, office_room, work_schedule,
  civil_status, nationality, notes_other,
  created_at, updated_at
`;

/** Columns non-Principal users may PATCH on /users/me/profile. */
const SELF_EDITABLE_COLUMNS = [
  'mobile_phone',
  'telephone',
  'address',
  'department_subject',
  'position_title',
  'employee_id',
  'emergency_contact_name',
  'emergency_contact_phone',
  'office_room',
  'work_schedule',
  'civil_status',
  'nationality',
  'notes_other',
];

/** Reject Principal-controlled fields when role < 4 self-updates (request body keys). */
const SELF_FORBIDDEN_KEYS = new Set([
  'name',
  'email',
  'role_level',
  'teacher_rank',
  'password',
  'is_active',
]);

function assertTeacherUsesGmail(email, roleLevel) {
  const e = String(email || '').toLowerCase().trim();
  if (Number(roleLevel) !== ROLES.TEACHER) return;
  if (!e.endsWith('@gmail.com')) {
    throw new HttpError(
      400,
      'Teacher accounts must register with Gmail (email ending in @gmail.com)'
    );
  }
}

/**
 * Undefined = omit change. null clears.
 */
function parseTeacherRankInput(value, roleLevel) {
  if (value === undefined) return undefined;
  if (value === null || value === '') {
    return Number(roleLevel) === ROLES.TEACHER ? null : null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 7) {
    throw new HttpError(400, 'teacher_rank must be an integer from 1 to 7');
  }
  if (Number(roleLevel) !== ROLES.TEACHER) {
    throw new HttpError(400, 'teacher_rank applies only to Teacher accounts');
  }
  return n;
}

function stringifyProfileUpdates(body, columnNames) {
  const setParts = [];
  const params = [];
  for (const col of columnNames) {
    if (!Object.prototype.hasOwnProperty.call(body, col)) continue;
    let val;
    if (col === 'address' || col === 'notes_other') {
      val = optionalString(body[col], col, { max: 8000 });
    } else if (col === 'work_schedule') {
      val = optionalString(body[col], col, { max: 500 });
    } else if (['department_subject', 'position_title'].includes(col)) {
      val = optionalString(body[col], col, { max: 255 });
    } else if (['mobile_phone', 'telephone', 'emergency_contact_phone'].includes(col)) {
      val = optionalString(body[col], col, { max: 40 });
    } else if (col === 'employee_id') {
      val = optionalString(body[col], col, { max: 100 });
    } else if (col === 'office_room') {
      val = optionalString(body[col], col, { max: 120 });
    } else if (col === 'civil_status') {
      val = optionalString(body[col], col, { max: 50 });
    } else if (col === 'nationality') {
      val = optionalString(body[col], col, { max: 100 });
    } else if (col === 'emergency_contact_name') {
      val = optionalString(body[col], col, { max: 150 });
    } else {
      val = optionalString(body[col], col, { max: 255 });
    }
    setParts.push(`${col} = ?`);
    params.push(val);
  }
  return { setParts, params };
}

function shapePublicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role_level: Number(row.role_level),
    role: roleName(row.role_level),
    is_active: Boolean(Number(row.is_active)),
    teacher_rank: row.teacher_rank == null ? null : Number(row.teacher_rank),
    mobile_phone: row.mobile_phone ?? null,
    telephone: row.telephone ?? null,
    address: row.address ?? null,
    department_subject: row.department_subject ?? null,
    position_title: row.position_title ?? null,
    employee_id: row.employee_id ?? null,
    emergency_contact_name: row.emergency_contact_name ?? null,
    emergency_contact_phone: row.emergency_contact_phone ?? null,
    office_room: row.office_room ?? null,
    work_schedule: row.work_schedule ?? null,
    civil_status: row.civil_status ?? null,
    nationality: row.nationality ?? null,
    notes_other: row.notes_other ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function profileColumnsFromBody(body) {
  const columns = [];
  const values = [];
  const { setParts, params } = stringifyProfileUpdates(body, SELF_EDITABLE_COLUMNS);
  for (let i = 0; i < setParts.length; i++) {
    const col = setParts[i].split(' =')[0].trim();
    columns.push(col);
    values.push(params[i]);
  }
  return { columns, values };
}

async function loadRow(id) {
  const [rows] = await pool.query(
    `SELECT ${USER_ROW_SELECT} FROM users WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0];
}

/**
 * POST /api/users  (Admin only)
 */
async function createUser(req, res, next) {
  try {
    const body = req.body || {};

    const name = requireString(body.name, 'name', { min: 2, max: 150 });
    const email = requireEmail(body.email);
    const password = requirePassword(body.password);

    if (!isValidRole(body.role_level)) {
      throw new HttpError(400, 'role_level must be 1, 2, or 3');
    }
    const roleLevel = Number(body.role_level);
    if (roleLevel === ROLES.ADMIN) {
      throw new HttpError(403, 'Cannot create another admin through this endpoint');
    }

    assertTeacherUsesGmail(email, roleLevel);

    let teacherRank = null;
    if (body.teacher_rank !== undefined && body.teacher_rank !== null && body.teacher_rank !== '') {
      teacherRank = parseTeacherRankInput(body.teacher_rank, roleLevel);
    } else if (roleLevel === ROLES.TEACHER) {
      throw new HttpError(400, 'teacher_rank is required for Teacher accounts (1–7)');
    }

    const [existing] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    if (existing.length) throw new HttpError(409, 'A user with that email already exists');

    const hash = await bcrypt.hash(password, env.bcryptRounds);

    // Account management creates credentials and role only — users complete their own profile.
    const extraCols = [];
    const extraVals = [];

    const insertCols = ['name', 'email', 'password_hash', 'role_level', 'teacher_rank', ...extraCols];
    const placeholders = insertCols.map(() => '?');
    const vals = [name, email, hash, roleLevel, teacherRank, ...extraVals];

    const sql = `INSERT INTO users (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')})`;
    const [result] = await pool.query(sql, vals);

    logger.info('users.create', {
      reqId: req.id,
      actor: req.user.id,
      newUser: result.insertId,
      role: roleName(roleLevel),
    });

    const created = await loadRow(result.insertId);
    res.status(201).json({ user: shapePublicUser(created) });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users  (Admin only)
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
      `SELECT ${USER_ROW_SELECT.replace(/\s+/g, ' ')}
         FROM users ${where}
         ORDER BY role_level ASC, name ASC`,
      params
    );

    res.json({
      users: rows.map((u) => shapePublicUser(u)),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users/:id  (Admin only)
 */
async function getUser(req, res, next) {
  try {
    const id = requireId(req.params.id);
    const row = await loadRow(id);
    if (!row) throw new HttpError(404, 'User not found');
    res.json({ user: shapePublicUser(row) });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users/me/profile  (authenticated)
 */
async function getMyProfile(req, res, next) {
  try {
    if (Number(req.user.role_level) === ROLES.ADMIN) {
      throw new HttpError(
        403,
        'Principal accounts do not use the profile workspace. Manage your account under Account management.'
      );
    }
    const row = await loadRow(req.user.id);
    if (!row) throw new HttpError(404, 'User not found');
    res.json({ user: shapePublicUser(row) });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/users/me/profile  (authenticated, roles 1–3 only)
 *
 * Editable profile/contact subset. Name, email, password, and role are managed
 * by the Principal (Account management / PATCH /users/:id for the Principal's own row).
 */
async function updateMyProfile(req, res, next) {
  try {
    const body = req.body || {};
    const actorRole = Number(req.user.role_level);

    if (actorRole === ROLES.ADMIN) {
      throw new HttpError(
        403,
        'Principal accounts do not use the profile API. Update your name, email, or password under Account management.'
      );
    }

    for (const k of Object.keys(body)) {
      if (SELF_FORBIDDEN_KEYS.has(k)) {
        throw new HttpError(403, 'You cannot change this field yourself; contact the Principal.');
      }
    }

    const row = await loadRow(req.user.id);
    if (!row || !Number(row.is_active)) throw new HttpError(404, 'User not found');

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const chunks = [];
      const params = [];

      const prof = stringifyProfileUpdates(body, SELF_EDITABLE_COLUMNS);
      chunks.push(...prof.setParts);
      params.push(...prof.params);

      if (chunks.length === 0) {
        await conn.commit();
        const fresh = await loadRow(row.id);
        return res.json({ user: shapePublicUser(fresh) });
      }

      params.push(row.id);

      await conn.query(`UPDATE users SET ${chunks.join(', ')} WHERE id = ? LIMIT 1`, params);

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    const updated = await loadRow(req.user.id);
    logger.info('users.profile_self', { reqId: req.id, actor: req.user.id });
    res.json({ user: shapePublicUser(updated) });
  } catch (err) {
    next(err);
  }
}

async function bumpToken(conn, userId) {
  await conn.query(`UPDATE users SET token_version = token_version + 1 WHERE id = ?`, [userId]);
}

/**
 * PATCH /api/users/:id/active  (Admin only)
 */
async function setUserActive(req, res, next) {
  try {
    const id = requireId(req.params.id);
    const isActive = requireBool(req.body && req.body.is_active, 'is_active');

    const [target] = await pool.query('SELECT id, role_level FROM users WHERE id = ? LIMIT 1', [
      id,
    ]);
    if (!target.length) throw new HttpError(404, 'User not found');
    if (target[0].role_level === ROLES.ADMIN) {
      throw new HttpError(403, 'Cannot deactivate an admin via this endpoint');
    }

    await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);

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

/**
 * PATCH /api/users/:id  (Admin only)
 *
 * Account fields only: name, email, password, role_level, teacher_rank, is_active.
 * Profile/contact columns are never set here (roles 1–3 use PATCH /users/me/profile).
 */
async function updateUser(req, res, next) {
  try {
    const id = requireId(req.params.id);
    const body = req.body || {};

    for (const key of Object.keys(body)) {
      if (SELF_EDITABLE_COLUMNS.includes(key)) {
        throw new HttpError(
          403,
          'Profile and contact fields are not updated through Account management. Teachers, Coordinators, and Masters update them via PATCH /users/me/profile.'
        );
      }
    }

    const row = await loadRow(id);
    if (!row) throw new HttpError(404, 'User not found');
    if (row.role_level === ROLES.ADMIN && id !== req.user.id) {
      throw new HttpError(403, 'Another Principal account cannot be edited here');
    }

    let effectiveRole = Number(row.role_level);
    if (body.role_level !== undefined) {
      if (!isValidRole(body.role_level)) {
        throw new HttpError(400, 'role_level must be 1, 2, 3 or 4');
      }
      const rl = Number(body.role_level);
      if (rl === ROLES.ADMIN && id !== req.user.id) {
        throw new HttpError(403, 'Promoting users to Principal is not allowed');
      }
      if (rl === ROLES.TEACHER && Number(row.role_level) !== ROLES.TEACHER) {
        if (body.teacher_rank === undefined || body.teacher_rank === null || body.teacher_rank === '') {
          throw new HttpError(400, 'teacher_rank (1–7) is required when assigning Teacher role');
        }
      }
      effectiveRole = rl;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const chunks = [];
      const params = [];

      if (body.name !== undefined) {
        chunks.push('name = ?');
        params.push(requireString(body.name, 'name', { min: 2, max: 150 }));
      }

      if (body.email !== undefined) {
        const em = requireEmail(body.email);
        assertTeacherUsesGmail(em, effectiveRole);
        const [taken] = await conn.query('SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1', [
          em,
          id,
        ]);
        if (taken.length) throw new HttpError(409, 'That email is already in use');
        chunks.push('email = ?');
        params.push(em);
      }

      if (body.role_level !== undefined) {
        if (!isValidRole(body.role_level)) throw new HttpError(400, 'Invalid role_level');
        const rl = Number(body.role_level);
        chunks.push('role_level = ?');
        params.push(rl);
        if (rl !== ROLES.TEACHER) {
          chunks.push('teacher_rank = ?');
          params.push(null);
        }
      }

      if (body.teacher_rank !== undefined) {
        const tr = parseTeacherRankInput(body.teacher_rank, effectiveRole);
        chunks.push('teacher_rank = ?');
        params.push(tr);
      }

      let passwordBump = false;
      if (body.password !== undefined && String(body.password).length > 0) {
        const pw = requirePassword(body.password, 'password');
        chunks.push('password_hash = ?');
        params.push(await bcrypt.hash(pw, env.bcryptRounds));
        passwordBump = true;
      }

      if (body.is_active !== undefined) {
        if (row.role_level === ROLES.ADMIN) {
          throw new HttpError(403, 'Cannot change active flag on a Principal account');
        }
        const active = requireBool(body.is_active, 'is_active');
        chunks.push('is_active = ?');
        params.push(active ? 1 : 0);
      }

      if (chunks.length === 0) {
        await conn.commit();
        const fresh = await loadRow(id);
        return res.json({ user: shapePublicUser(fresh) });
      }

      params.push(id);
      await conn.query(`UPDATE users SET ${chunks.join(', ')} WHERE id = ? LIMIT 1`, params);
      if (passwordBump) {
        await bumpToken(conn, id);
      }

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    const updated = await loadRow(id);
    logger.info('users.update', { reqId: req.id, actor: req.user.id, target: id });
    res.json({ user: shapePublicUser(updated) });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/users/:id  (Admin only)
 */
async function deleteUser(req, res, next) {
  try {
    const id = requireId(req.params.id);
    if (id === req.user.id) {
      throw new HttpError(400, 'You cannot delete your own account');
    }

    const row = await loadRow(id);
    if (!row) throw new HttpError(404, 'User not found');
    if (row.role_level === ROLES.ADMIN) {
      throw new HttpError(403, 'Principal accounts cannot be deleted through this endpoint');
    }

    try {
      await pool.query('DELETE FROM users WHERE id = ? LIMIT 1', [id]);
    } catch (e) {
      if (e.errno === 1451 || e.code === 'ER_ROW_IS_REFERENCED_2') {
        throw new HttpError(
          409,
          'This user cannot be deleted while they still own submitted documents. Reassign or archive files first.'
        );
      }
      throw e;
    }

    logger.info('users.delete', { reqId: req.id, actor: req.user.id, target: id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createUser,
  listUsers,
  getUser,
  getMyProfile,
  updateMyProfile,
  setUserActive,
  updateUser,
  deleteUser,
};
