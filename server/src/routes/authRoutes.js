import { Router } from 'express';
import * as auth from '../controllers/authController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { loginSchema, registerSchema } from '../validators/auth.schemas.js';

const router = Router();

router.use(authLimiter);

router.post('/register', validate(registerSchema), auth.register);
router.post('/login', validate(loginSchema), auth.login);
router.post('/refresh', auth.refresh);
router.post('/logout', auth.logout);
router.get('/me', requireAuth, auth.me);

export default router;
