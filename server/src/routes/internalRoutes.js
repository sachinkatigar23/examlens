import express, { Router } from 'express';
import * as internal from '../controllers/internalController.js';
import { requireServiceKey } from '../middleware/requireServiceKey.js';
import { validate } from '../middleware/validate.js';
import { documentUpdateSchema } from '../validators/internal.schemas.js';

// Service-to-service routes (AI service → Node). Not for browsers: no cookies, no CORS needed.
const router = Router();

router.use(requireServiceKey);
// Results for a long paper or syllabus can exceed the public API's 100 kb body limit.
router.use(express.json({ limit: '2mb' }));

router.patch('/documents/:id', validate(documentUpdateSchema), internal.updateDocument);

export default router;
