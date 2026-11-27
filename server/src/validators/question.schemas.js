import { z } from 'zod';
import { marks, modeSchema, objectId } from './common.schemas.js';

// PATCH /spaces/:spaceId/questions/:questionId — move a question to another topic (null = no topic).
export const moveQuestionSchema = z.object({
  topicId: objectId.nullable(),
});

// PATCH /spaces/:spaceId/questions/:questionId/marks — the student corrects a question's marks.
export const marksSchema = z.object({ marks });

// POST /spaces/:spaceId/bank/answer-all — the whole bank, or one unit.
export const answerAllSchema = z.object({
  mode: modeSchema,
  unit: z.string().trim().min(1).max(40).nullable().optional().default(null),
});
