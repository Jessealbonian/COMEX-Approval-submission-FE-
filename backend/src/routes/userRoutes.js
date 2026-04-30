'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { ROLES } = require('../utils/roles');
const {
  createUser,
  listUsers,
  setUserActive,
} = require('../controllers/userController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.use(authenticate, requireRole(ROLES.ADMIN));

router.post('/', asyncHandler(createUser));
router.get('/', asyncHandler(listUsers));
router.patch('/:id/active', asyncHandler(setUserActive));

module.exports = router;
