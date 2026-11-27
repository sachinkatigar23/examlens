import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { hasServiceKey } from '../utils/serviceKey.js';

const tooMany = (code, message) => ({ error: { code, message } });
const common = { standardHeaders: 'draft-8', legacyHeaders: false };

// Only failed auth attempts count, so normal use never hits the limit but password guessing does.
export const authLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  message: tooMany('TOO_MANY_REQUESTS', 'Too many attempts, try again in 15 minutes'),
});

// Each answer keeps the GPU busy for several seconds, so cap questions per user (not per IP).
// The service key (the demo seed script) isn't limited: it writes a whole notebook's answers in one go.
const userAskLimiter = rateLimit({
  ...common,
  windowMs: 5 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.user.id,
  skip: hasServiceKey,
  message: tooMany('TOO_MANY_REQUESTS', 'That is a lot of questions at once. Wait a few minutes.'),
});

// --- Public demo: every visitor is the same user, so the limits are per IP (the default key) and stricter. ---

const demoBurst = rateLimit({
  ...common,
  windowMs: 5 * 60 * 1000,
  limit: 5,
  message: tooMany('TOO_MANY_REQUESTS', 'The demo allows 5 questions every 5 minutes. Take a breath and try again soon.'),
});

const demoDaily = rateLimit({
  ...common,
  windowMs: 24 * 60 * 60 * 1000,
  limit: () => env.demoAskPerIp,
  message: tooMany('TOO_MANY_REQUESTS', "You've reached today's demo limit. Run ExamLens yourself for unlimited answers."),
});

// On top of the Cloud model's own daily quota (shared by everyone): one visitor can't use it all up.
const demoCloud = rateLimit({
  ...common,
  windowMs: 24 * 60 * 60 * 1000,
  limit: () => env.demoCloudPerIp,
  skip: (req) => req.body?.mode !== 'cloud',
  message: tooMany('CLOUD_LIMIT', "You've used your Cloud answers in this demo for today. Switch to Local (slower) to keep going."),
});

// The demo box has no GPU: a few answers at once is all it can do, so later visitors are told to wait
// instead of queueing for minutes inside Ollama.
let demoInFlight = 0;
function demoBusy(req, res, next) {
  if (demoInFlight >= env.demoMaxConcurrent) {
    return next(new AppError(503, 'DEMO_BUSY', 'The demo is busy answering other visitors. Try again in a minute.'));
  }
  demoInFlight += 1;
  res.once('close', () => {
    demoInFlight -= 1;
  });
  next();
}

// Runs middlewares one after another, like listing them in a route.
const chain = (middlewares) => (req, res, next) => {
  let i = 0;
  const step = (err) => {
    if (err) return next(err);
    const mw = middlewares[i++];
    if (!mw) return next();
    mw(req, res, step);
  };
  step();
};

const demoAskLimiter = chain([demoBurst, demoDaily, demoCloud, demoBusy]);

// Everything that makes the model write (Ask, exam answers, lessons, sheets, Check my answer, photos).
export function askLimiter(req, res, next) {
  if (req.user?.demo) return demoAskLimiter(req, res, next);
  return userAskLimiter(req, res, next);
}
