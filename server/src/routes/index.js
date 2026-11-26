import { Router } from 'express';
import mongoose from 'mongoose';
import authRoutes from './authRoutes.js';
import spaceRoutes from './spaceRoutes.js';
import { getProviders, isAiHealthy } from '../services/aiService.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

// The app still works without the AI service (login, uploads queue up), so only Mongo decides the status code.
router.get('/health', async (_req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  const ai = await isAiHealthy();
  res.status(mongoOk ? 200 : 503).json({ status: mongoOk ? 'ok' : 'degraded', mongo: mongoOk, ai });
});

// What the Local / Cloud toggle can offer right now (Cloud needs GEMINI_API_KEY in the AI service).
router.get('/ai/providers', requireAuth, async (_req, res) => {
  res.json(await getProviders());
});

router.use('/auth', authRoutes);
router.use('/spaces', spaceRoutes);

export default router;
