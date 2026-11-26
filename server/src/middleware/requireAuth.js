import { AppError } from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/tokens.js';

// Reads "Authorization: Bearer <accessToken>" and sets req.user = { id, name }.
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Please log in'));
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, name: payload.name };
    next();
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    next(new AppError(401, code, 'Your session has expired, please log in again'));
  }
}
