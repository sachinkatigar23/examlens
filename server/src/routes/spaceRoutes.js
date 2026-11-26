import { Router } from 'express';
import * as spaces from '../controllers/spaceController.js';
import * as askCtrl from '../controllers/askController.js';
import * as analysis from '../controllers/analysisController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireSpaceOwner } from '../middleware/requireSpaceOwner.js';
import { validate } from '../middleware/validate.js';
import { askLimiter } from '../middleware/rateLimit.js';
import { createSpaceSchema, updateSpaceSchema } from '../validators/space.schemas.js';
import { askSchema } from '../validators/ask.schemas.js';
import documentRoutes from './documentRoutes.js';

const router = Router();

router.use(requireAuth);

router.get('/', spaces.listSpaces);
router.post('/', validate(createSpaceSchema), spaces.createSpace);

router.get('/:spaceId', requireSpaceOwner, spaces.getSpace);
router.patch('/:spaceId', requireSpaceOwner, validate(updateSpaceSchema), spaces.updateSpace);
router.delete('/:spaceId', requireSpaceOwner, spaces.deleteSpace);

router.use('/:spaceId/documents', requireSpaceOwner, documentRoutes);

// Ask ExamLens (SSE) + chat history
router.post('/:spaceId/ask', requireSpaceOwner, askLimiter, validate(askSchema), askCtrl.ask);
router.get('/:spaceId/messages', requireSpaceOwner, askCtrl.listMessages);
router.delete('/:spaceId/messages', requireSpaceOwner, askCtrl.clearMessages);

// Analyzer
router.get('/:spaceId/analysis', requireSpaceOwner, analysis.getAnalysis);
router.get('/:spaceId/questions', requireSpaceOwner, analysis.listQuestions);

export default router;
