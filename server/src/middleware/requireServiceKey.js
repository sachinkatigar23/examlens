import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

// Internal routes are called only by the AI service, which proves itself with the shared X-Service-Key.
export function requireServiceKey(req, _res, next) {
  const given = Buffer.from(req.get('X-Service-Key') || '');
  const expected = Buffer.from(env.serviceKey);
  // timingSafeEqual: comparison time doesn't reveal how many characters were right.
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return next(new AppError(401, 'INVALID_SERVICE_KEY', 'Invalid service key'));
  }
  next();
}
