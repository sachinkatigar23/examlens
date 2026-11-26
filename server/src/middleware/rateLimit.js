import rateLimit from 'express-rate-limit';

// Only failed auth attempts count, so normal use never hits the limit but password guessing does.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts, try again in 15 minutes' } },
});

// Each answer keeps the GPU busy for several seconds, so cap questions per user (not per IP).
export const askLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.user.id,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'That is a lot of questions at once. Wait a few minutes.' } },
});
