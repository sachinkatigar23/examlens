import crypto from 'node:crypto';
import { env } from '../config/env.js';

// True when the request carries the shared X-Service-Key (the AI service, or the demo seed script).
// timingSafeEqual: comparison time doesn't reveal how many characters were right.
export function hasServiceKey(req) {
  const given = Buffer.from(req.get('X-Service-Key') || '');
  const expected = Buffer.from(env.serviceKey);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}
