import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { cookieSecure, env } from '../config/env.js';
import { isDemoUser } from './demo.js';

export const REFRESH_COOKIE = 'refreshToken';

// demo: true marks the shared public-demo account, which requireAuth treats as read-only.
export function signAccessToken(user) {
  const claims = { sub: user.id, name: user.name, ...(isDemoUser(user) ? { demo: true } : {}) };
  return jwt.sign(claims, env.jwtAccessSecret, {
    expiresIn: env.accessTokenTtl,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

// Each refresh token has a unique id (jti) so we can tell tokens apart for rotation.
export function signRefreshToken(user) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: user.id, tv: user.tokenVersion, jti }, env.jwtRefreshSecret, {
    expiresIn: env.refreshTokenTtl,
  });
  const expiresAt = new Date(jwt.decode(token).exp * 1000);
  return { token, jti, expiresAt };
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}

// Cookie is scoped to the auth routes, so it isn't sent with every API call.
const cookieOptions = {
  httpOnly: true,
  secure: cookieSecure,
  sameSite: 'lax', // localhost:5173 and localhost:5000 are the same site
  path: '/api/v1/auth',
};

export function setRefreshCookie(res, token, expiresAt) {
  res.cookie(REFRESH_COOKIE, token, { ...cookieOptions, expires: expiresAt });
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
}
