import { Router } from 'express';
import mongoose from 'mongoose';
import authRoutes from './authRoutes.js';
import spaceRoutes from './spaceRoutes.js';

const router = Router();

router.get('/health', (_req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  res.status(mongoOk ? 200 : 503).json({ status: mongoOk ? 'ok' : 'degraded', mongo: mongoOk });
});

router.use('/auth', authRoutes);
router.use('/spaces', spaceRoutes);

export default router;
