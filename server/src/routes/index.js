import { Router } from 'express';
import * as healthCtrl from '../controllers/healthController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import authRoutes from './authRoutes.js';
import spaceRoutes from './spaceRoutes.js';

const router = Router();

router.get('/health', healthCtrl.health);
router.get('/config', healthCtrl.publicConfig);
router.get('/ai/providers', requireAuth, healthCtrl.providers);

router.use('/auth', authRoutes);
router.use('/spaces', spaceRoutes);

export default router;
