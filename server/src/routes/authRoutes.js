import { Router } from 'express';
import * as auth from '../controllers/authController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { loginSchema, registerSchema } from '../validators/auth.schemas.js';

const router = Router();

// Rate limit only where a password is checked. (On the whole router, every page load by a logged-out visitor
// counted as a failed attempt: the app's session check, POST /refresh, correctly answers 401.)
router.post('/register', authLimiter, validate(registerSchema), auth.register);
router.post('/login', authLimiter, validate(loginSchema), auth.login);
router.post('/refresh', auth.refresh);
router.post('/logout', auth.logout);
router.get('/me', requireAuth, auth.me);

export default router;
