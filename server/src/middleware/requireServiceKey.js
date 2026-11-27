import { AppError } from '../utils/AppError.js';
import { hasServiceKey } from '../utils/serviceKey.js';

// Internal routes are called only by the AI service, which proves itself with the shared X-Service-Key.
export function requireServiceKey(req, _res, next) {
  if (!hasServiceKey(req)) return next(new AppError(401, 'INVALID_SERVICE_KEY', 'Invalid service key'));
  next();
}
