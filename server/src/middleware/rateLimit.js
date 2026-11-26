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
