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
import { requireAuth } from '../middleware/requireAuth.js';
import { demoReadOnlyGuard } from '../middleware/demoReadOnly.js';
import { requireSpaceOwner } from '../middleware/requireSpaceOwner.js';
import { validate } from '../middleware/validate.js';
import { askLimiter } from '../middleware/rateLimit.js';
import { uploadImage } from '../middleware/uploadImage.js';
import { askSchema, transcribeSchema } from '../validators/ask.schemas.js';
import { checkSchema } from '../validators/check.schemas.js';
import { generateSchema } from '../validators/common.schemas.js';
import { examDateSchema, tickSchema } from '../validators/plan.schemas.js';
import { answerAllSchema, marksSchema, moveQuestionSchema } from '../validators/question.schemas.js';
import { createSpaceSchema, updateSpaceSchema } from '../validators/space.schemas.js';
import { lessonStatusSchema } from '../validators/study.schemas.js';
import documentRoutes from './documentRoutes.js';

const router = Router();

router.use(requireAuth);
router.use(demoReadOnlyGuard); // public demo account: read-only except Ask / Check / missing answers

router.get('/', spaces.listSpaces);
router.post('/', validate(createSpaceSchema), spaces.createSpace);

// Everything below is about one notebook: requireSpaceOwner loads it into req.space, or answers 404 when it
// doesn't exist or belongs to someone else. Every route after this line can trust req.space.
router.use('/:spaceId', requireSpaceOwner);

router.get('/:spaceId', spaces.getSpace);
router.patch('/:spaceId', validate(updateSpaceSchema), spaces.updateSpace);
router.delete('/:spaceId', spaces.deleteSpace);

router.use('/:spaceId/documents', documentRoutes);

// Ask ExamLens (SSE) + chat history (?thread=ask | study:<unit>)
router.post('/:spaceId/ask', askLimiter, validate(askSchema), askCtrl.ask);
router.get('/:spaceId/messages', askCtrl.listMessages);
router.delete('/:spaceId/messages', askCtrl.clearMessages);

// Snap a doubt: photo → transcription → asked through /ask with photoId
router.post('/:spaceId/photos', uploadImage, photos.uploadPhoto);
router.get('/:spaceId/photos/:photoId/file', photos.getPhotoFile);
router.post('/:spaceId/photos/:photoId/transcribe', askLimiter, validate(transcribeSchema), photos.transcribe);
router.delete('/:spaceId/photos/:photoId', photos.deletePhoto);

// Analyzer (+ weak topics) and moving a question to another topic
router.get('/:spaceId/analysis', analysis.getAnalysis);
router.get('/:spaceId/questions', analysis.listQuestions);
router.patch('/:spaceId/questions/:questionId', validate(moveQuestionSchema), analysis.moveQuestion);

// Question Bank + exam answers (for bank and past-paper questions alike)
router.get('/:spaceId/bank', bank.getBank);
router.post('/:spaceId/bank/answer-all', validate(answerAllSchema), bank.answerAll);
router.get('/:spaceId/bank/job', bank.getJob);
router.delete('/:spaceId/bank/job', bank.stopJob);
router.get('/:spaceId/answers', bank.listAnswers);
router.patch('/:spaceId/questions/:questionId/marks', validate(marksSchema), bank.setMarks);
router.get('/:spaceId/questions/:questionId/answer', bank.getAnswer);
router.post('/:spaceId/questions/:questionId/answer', askLimiter, validate(generateSchema), bank.generateAnswer);

// Check my answer (SSE: grade → improved version) + the attempts so far
router.post('/:spaceId/checks', askLimiter, validate(checkSchema), checks.checkAnswer);
router.get('/:spaceId/checks', checks.listChecks);
router.get('/:spaceId/checks/:checkId', checks.getCheck);
router.delete('/:spaceId/checks/:checkId', checks.deleteCheck);

// Exam countdown planner
router.get('/:spaceId/plan', plans.getPlan);
router.put('/:spaceId/plan', validate(examDateSchema), plans.setExamDate);
router.delete('/:spaceId/plan', plans.deletePlan);
router.patch('/:spaceId/plan/items/:itemId', validate(tickSchema), plans.tickItem);

// Last-night revision sheet, one per unit (":unit" is URL-encoded, e.g. Unit%202)
router.get('/:spaceId/revision/:unit', revision.getSheet);
router.post('/:spaceId/revision/:unit', askLimiter, validate(generateSchema), revision.generateSheet);

// Study mode
router.get('/:spaceId/study', study.getStudyPlan);
router.get('/:spaceId/topics/:topicId/lesson', study.getLesson);
router.post('/:spaceId/topics/:topicId/lesson', askLimiter, validate(generateSchema), study.generateLesson);
router.patch('/:spaceId/topics/:topicId/lesson', validate(lessonStatusSchema), study.setStudied);

export default router;
