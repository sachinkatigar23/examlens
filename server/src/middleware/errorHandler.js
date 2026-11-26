import fs from 'node:fs/promises';
import multer from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`));
}

// Every error ends up here and leaves as { error: { code, message, details? } }.
// eslint-disable-next-line no-unused-vars
export async function errorHandler(err, req, res, _next) {
  // If the request failed after multer saved a file, don't leave the orphan on disk.
  if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});

  const { status, body } = toResponse(err);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: body });
}

function toResponse(err) {
  if (err instanceof AppError) {
    return { status: err.status, body: { code: err.code, message: err.message } };
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    const first = details[0];
    const message = first.field ? `${first.field}: ${first.message}` : first.message;
    return { status: 400, body: { code: 'VALIDATION_ERROR', message, details } };
  }
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const message = err.field === 'image' ? 'Photo must be 10 MB or smaller' : 'PDF must be 20 MB or smaller';
      return { status: 413, body: { code: 'FILE_TOO_LARGE', message } };
    }
    return { status: 400, body: { code: 'UPLOAD_ERROR', message: err.message } };
  }
  if (err.code === 11000) {
    return { status: 409, body: { code: 'DUPLICATE', message: 'That already exists' } };
  }
  if (err.type === 'entity.parse.failed') {
    return { status: 400, body: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } };
  }
  return { status: 500, body: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side' } };
}
