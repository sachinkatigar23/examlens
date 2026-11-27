import { z } from 'zod';
import { modeSchema, objectId } from './common.schemas.js';

export const askSchema = z.object({
  question: z.string().trim().min(2, 'Type a question first').max(4000, 'Keep the question under 4000 characters'),
  mode: modeSchema,
  // "study:Unit 2" = the follow-up chat under a lesson; answers then prefer that unit's notes.
  thread: z
    .string()
    .regex(/^(ask|study:.{1,40})$/, 'Unknown chat thread')
    .default('ask'),
  photoId: objectId.optional(), // set when the question came from a photo
});

export const transcribeSchema = z.object({
  mode: modeSchema,
  // doubt = a question/code to solve · answer = the student's own handwritten answer (Check my answer)
  purpose: z.enum(['doubt', 'answer']).default('doubt'),
});
