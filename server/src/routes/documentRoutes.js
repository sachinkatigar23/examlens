import { Router } from 'express';
import * as documents from '../controllers/documentController.js';
import { uploadPdf } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { uploadDocumentSchema } from '../validators/document.schemas.js';

// Mounted at /spaces/:spaceId/documents after requireAuth + requireSpaceOwner, so req.space is set.
const router = Router({ mergeParams: true });

// multer runs first: it parses the multipart body, so the kind/year fields only exist after it.
router.post('/', uploadPdf, validate(uploadDocumentSchema), documents.uploadDocument);
router.get('/', documents.listDocuments);
router.post('/:docId/retry', documents.retryDocument);
router.delete('/:docId', documents.deleteDocument);

export default router;
