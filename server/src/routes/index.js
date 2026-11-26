import { Router } from 'express';
import mongoose from 'mongoose';
import authRoutes from './authRoutes.js';
import spaceRoutes from './spaceRoutes.js';
import { isAiHealthy } from '../services/aiService.js';

const router = Router();

// The app still works without the AI service (login, uploads queue up), so only Mongo decides the status code.
router.get('/health', async (_req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  const ai = await isAiHealthy();
  res.status(mongoOk ? 200 : 503).json({ status: mongoOk ? 'ok' : 'degraded', mongo: mongoOk, ai });
});

router.use('/auth', authRoutes);
router.use('/spaces', spaceRoutes);

export default router;
