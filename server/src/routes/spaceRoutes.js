import { Router } from 'express';
import * as spaces from '../controllers/spaceController.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireSpaceOwner } from '../middleware/requireSpaceOwner.js';
import { validate } from '../middleware/validate.js';
import { createSpaceSchema, updateSpaceSchema } from '../validators/space.schemas.js';
import documentRoutes from './documentRoutes.js';

const router = Router();

router.use(requireAuth);

router.get('/', spaces.listSpaces);
router.post('/', validate(createSpaceSchema), spaces.createSpace);

router.get('/:spaceId', requireSpaceOwner, spaces.getSpace);
router.patch('/:spaceId', requireSpaceOwner, validate(updateSpaceSchema), spaces.updateSpace);
router.delete('/:spaceId', requireSpaceOwner, spaces.deleteSpace);

router.use('/:spaceId/documents', requireSpaceOwner, documentRoutes);

export default router;
