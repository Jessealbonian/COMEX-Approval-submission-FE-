'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const { upload, verifyPdfMagic } = require('../middleware/upload');
const { ROLES } = require('../utils/roles');
const {
  uploadFile,
  listFiles,
  getFile,
  downloadFile,
} = require('../controllers/fileController');
const {
  addComment,
  forwardFile,
  finalizeFile,
} = require('../controllers/commentController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Every /api/files route requires a valid JWT. Anonymous traffic is
// rejected with 401 before any handler runs.
router.use(authenticate);

// Teacher-only upload (PDF + magic-byte verification)
router.post(
  '/',
  requireRole(ROLES.TEACHER),
  upload.single('file'),
  verifyPdfMagic,
  asyncHandler(uploadFile)
);

// Listing/viewing/downloading is filtered by visibility in the controller.
router.get('/', asyncHandler(listFiles));
router.get('/:id', asyncHandler(getFile));
router.get('/:id/download', asyncHandler(downloadFile));

// Comments / revisions: Coordinator, Master, Admin only.
router.post(
  '/:id/comments',
  requireRole(ROLES.COORDINATOR, ROLES.MASTER, ROLES.ADMIN),
  asyncHandler(addComment)
);

// Forwarding: Coordinator and Master only.
router.post(
  '/:id/forward',
  requireRole(ROLES.COORDINATOR, ROLES.MASTER),
  asyncHandler(forwardFile)
);

// Finalize: Admin only.
router.post(
  '/:id/finalize',
  requireRole(ROLES.ADMIN),
  asyncHandler(finalizeFile)
);

module.exports = router;
