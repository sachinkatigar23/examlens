import crypto from 'node:crypto';
import fs from 'node:fs';
import multer from 'multer';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

fs.mkdirSync(env.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: env.uploadDir,
  // Random name: never trust the user's file name on disk.
  filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.pdf`),
});

function pdfOnly(_req, file, cb) {
  const isPdf = file.mimetype === 'application/pdf' && /\.pdf$/i.test(file.originalname);
  if (!isPdf) return cb(new AppError(415, 'UNSUPPORTED_FILE', 'Only PDF files are allowed'));
  cb(null, true);
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const uploadPdf = multer({
  storage,
  fileFilter: pdfOnly,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
}).single('file');
