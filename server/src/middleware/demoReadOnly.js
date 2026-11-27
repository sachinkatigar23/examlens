import { demoReadOnly } from '../utils/demo.js';

// The demo account may read everything, but the only writes it may make are the ones that generate text:
// Ask, Check my answer, and writing an answer / lesson / revision sheet that doesn't exist yet (the
// controllers refuse to overwrite one). An allowlist, so a route added later is read-only for the demo too.
const ALLOWED_POSTS = [
  /^\/api\/v1\/spaces\/[^/]+\/ask$/,
  /^\/api\/v1\/spaces\/[^/]+\/checks$/,
  /^\/api\/v1\/spaces\/[^/]+\/questions\/[^/]+\/answer$/,
  /^\/api\/v1\/spaces\/[^/]+\/topics\/[^/]+\/lesson$/,
  /^\/api\/v1\/spaces\/[^/]+\/revision\/[^/]+$/,
];

export function demoReadOnlyGuard(req, _res, next) {
  if (!req.user?.demo || req.method === 'GET' || req.method === 'HEAD') return next();
  const path = req.originalUrl.split('?')[0];
  if (req.method === 'POST' && ALLOWED_POSTS.some((re) => re.test(path))) return next();
  next(demoReadOnly());
}
