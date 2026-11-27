import { Router } from 'express';
import * as spaces from '../controllers/spaceController.js';
import * as askCtrl from '../controllers/askController.js';
import * as analysis from '../controllers/analysisController.js';
import * as bank from '../controllers/bankController.js';
import * as study from '../controllers/studyController.js';
import * as photos from '../controllers/photoController.js';
import * as checks from '../controllers/checkController.js';
import * as plans from '../controllers/planController.js';
import * as revision from '../controllers/revisionController.js';
import { examDateSchema, tickSchema } from '../validators/plan.schemas.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireSpaceOwner } from '../middleware/requireSpaceOwner.js';
import { validate } from '../middleware/validate.js';
import { askLimiter } from '../middleware/rateLimit.js';
import { uploadImage } from '../middleware/uploadImage.js';
import { createSpaceSchema, updateSpaceSchema } from '../validators/space.schemas.js';
import {
  answerAllSchema,
  askSchema,
  checkSchema,
  generateSchema,
  lessonStatusSchema,
  marksSchema,
  transcribeSchema,
} from '../validators/ask.schemas.js';
import { moveQuestionSchema } from '../validators/question.schemas.js';
import documentRoutes from './documentRoutes.js';

const router = Router();

router.use(requireAuth);

router.get('/', spaces.listSpaces);
router.post('/', validate(createSpaceSchema), spaces.createSpace);

router.get('/:spaceId', requireSpaceOwner, spaces.getSpace);
router.patch('/:spaceId', requireSpaceOwner, validate(updateSpaceSchema), spaces.updateSpace);
router.delete('/:spaceId', requireSpaceOwner, spaces.deleteSpace);

router.use('/:spaceId/documents', requireSpaceOwner, documentRoutes);

// Ask ExamLens (SSE) + chat history (?thread=ask | study:<unit>)
router.post('/:spaceId/ask', requireSpaceOwner, askLimiter, validate(askSchema), askCtrl.ask);
router.get('/:spaceId/messages', requireSpaceOwner, askCtrl.listMessages);
router.delete('/:spaceId/messages', requireSpaceOwner, askCtrl.clearMessages);

// Snap a doubt: photo → transcription → asked through /ask with photoId
router.post('/:spaceId/photos', requireSpaceOwner, uploadImage, photos.uploadPhoto);
router.get('/:spaceId/photos/:photoId/file', requireSpaceOwner, photos.getPhotoFile);
router.post('/:spaceId/photos/:photoId/transcribe', requireSpaceOwner, askLimiter, validate(transcribeSchema), photos.transcribe);
router.delete('/:spaceId/photos/:photoId', requireSpaceOwner, photos.deletePhoto);

// Analyzer
router.get('/:spaceId/analysis', requireSpaceOwner, analysis.getAnalysis);
router.get('/:spaceId/questions', requireSpaceOwner, analysis.listQuestions);
router.patch('/:spaceId/questions/:questionId', requireSpaceOwner, validate(moveQuestionSchema), analysis.moveQuestion);

// Question Bank + exam answers (for bank and past-paper questions alike)
router.get('/:spaceId/bank', requireSpaceOwner, bank.getBank);
router.post('/:spaceId/bank/answer-all', requireSpaceOwner, validate(answerAllSchema), bank.answerAll);
router.get('/:spaceId/bank/job', requireSpaceOwner, bank.getJob);
router.delete('/:spaceId/bank/job', requireSpaceOwner, bank.stopJob);
router.get('/:spaceId/answers', requireSpaceOwner, bank.listAnswers);
router.patch('/:spaceId/questions/:questionId/marks', requireSpaceOwner, validate(marksSchema), bank.setMarks);
router.get('/:spaceId/questions/:questionId/answer', requireSpaceOwner, bank.getAnswer);
router.post('/:spaceId/questions/:questionId/answer', requireSpaceOwner, askLimiter, validate(generateSchema), bank.generateAnswer);

// Check my answer (SSE: grade → improved version) + the attempts so far
router.post('/:spaceId/checks', requireSpaceOwner, askLimiter, validate(checkSchema), checks.checkAnswer);
router.get('/:spaceId/checks', requireSpaceOwner, checks.listChecks);
router.get('/:spaceId/checks/:checkId', requireSpaceOwner, checks.getCheck);
router.delete('/:spaceId/checks/:checkId', requireSpaceOwner, checks.deleteCheck);

// Exam countdown planner
router.get('/:spaceId/plan', requireSpaceOwner, plans.getPlan);
router.put('/:spaceId/plan', requireSpaceOwner, validate(examDateSchema), plans.setExamDate);
router.delete('/:spaceId/plan', requireSpaceOwner, plans.deletePlan);
router.patch('/:spaceId/plan/items/:itemId', requireSpaceOwner, validate(tickSchema), plans.tickItem);

// Last-night revision sheet, one per unit (":unit" is URL-encoded, e.g. Unit%202)
router.get('/:spaceId/revision/:unit', requireSpaceOwner, revision.getSheet);
router.post('/:spaceId/revision/:unit', requireSpaceOwner, askLimiter, validate(generateSchema), revision.generateSheet);

// Study mode
router.get('/:spaceId/study', requireSpaceOwner, study.getStudyPlan);
router.get('/:spaceId/topics/:topicId/lesson', requireSpaceOwner, study.getLesson);
router.post('/:spaceId/topics/:topicId/lesson', requireSpaceOwner, askLimiter, validate(generateSchema), study.generateLesson);
router.patch('/:spaceId/topics/:topicId/lesson', requireSpaceOwner, validate(lessonStatusSchema), study.setStudied);

export default router;
