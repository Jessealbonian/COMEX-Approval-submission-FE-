'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');
const HttpError = require('../utils/httpError');

if (!fs.existsSync(env.uploads.dir)) {
  fs.mkdirSync(env.uploads.dir, { recursive: true });
}

/**
 * We rename every uploaded file to a random name with a fixed extension
 * to prevent path-traversal and duplicate-name issues. The original
 * filename is kept ONLY in the database column `original_name` and is
 * served back via Content-Disposition.
 */
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, env.uploads.dir);
  },
  filename(req, file, cb) {
    const random = crypto.randomBytes(16).toString('hex');
    cb(null, `${Date.now()}_${random}.pdf`);
  },
});

function pdfOnlyFilter(req, file, cb) {
  const isPdfMime = file.mimetype === 'application/pdf';
  const isPdfExt = path.extname(file.originalname).toLowerCase() === '.pdf';
  if (!isPdfMime || !isPdfExt) {
    return cb(new HttpError(400, 'Only PDF files are allowed'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter: pdfOnlyFilter,
  limits: {
    fileSize: env.uploads.maxBytes,
    files: 1,
    fields: 20,
    fieldSize: 64 * 1024,
  },
});

/**
 * Verify that the uploaded file actually starts with the PDF magic
 * header `%PDF-`. Multer trusts the client-supplied MIME type, so
 * without this check an attacker could upload an HTML/JS payload
 * disguised as a PDF.
 *
 * If verification fails we delete the file from disk and return 400.
 */
function verifyPdfMagic(req, res, next) {
  if (!req.file) return next();

  const fd = fs.openSync(req.file.path, 'r');
  try {
    const buf = Buffer.alloc(5);
    fs.readSync(fd, buf, 0, 5, 0);
    if (buf.toString('utf8') !== '%PDF-') {
      fs.closeSync(fd);
      fs.unlink(req.file.path, () => {});
      return next(new HttpError(400, 'Uploaded file is not a valid PDF'));
    }
    fs.closeSync(fd);
    next();
  } catch (err) {
    try { fs.closeSync(fd); } catch (_) { /* noop */ }
    fs.unlink(req.file.path, () => {});
    next(err);
  }
}

module.exports = { upload, verifyPdfMagic };
