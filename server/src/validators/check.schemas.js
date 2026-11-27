import { z } from 'zod';
import { marks, modeSchema, objectId } from './common.schemas.js';

// Check my answer: a stored question (questionId) or a typed one (question + marks).
export const checkSchema = z.object({
  questionId: objectId.optional(),
  question: z.string().trim().min(5, 'Type the question').max(4000).optional(),
  marks: marks.optional(),
  answer: z.string().trim().min(10, 'Write (or photograph) your answer first').max(12000, 'Keep the answer under 12000 characters'),
  photoId: objectId.optional(),
  mode: modeSchema,
});
