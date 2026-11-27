import { z } from 'zod';

export const modeSchema = z.enum(['local', 'cloud']).default('local');
const marks = z.number().int().min(1).max(30);

export const askSchema = z.object({
  question: z.string().trim().min(2, 'Type a question first').max(4000, 'Keep the question under 4000 characters'),
  mode: modeSchema,
  // "study:Unit 2" = the follow-up chat under a lesson; answers then prefer that unit's notes.
  thread: z
    .string()
    .regex(/^(ask|study:.{1,40})$/, 'Unknown chat thread')
    .default('ask'),
  photoId: z.string().regex(/^[a-f0-9]{24}$/).optional(), // set when the question came from a photo
});

// POST .../answer and POST .../lesson
export const generateSchema = z.object({
  mode: modeSchema,
  marks: marks.optional(),
});

export const marksSchema = z.object({ marks });

export const answerAllSchema = z.object({
  mode: modeSchema,
  unit: z.string().trim().min(1).max(40).nullable().optional().default(null),
});

export const lessonStatusSchema = z.object({ studied: z.boolean() });

export const transcribeSchema = z.object({
  mode: modeSchema,
  // doubt = a question/code to solve · answer = the student's own handwritten answer (Check my answer)
  purpose: z.enum(['doubt', 'answer']).default('doubt'),
});

const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');

// Check my answer: a stored question (questionId) or a typed one (question + marks).
export const checkSchema = z.object({
  questionId: objectId.optional(),
  question: z.string().trim().min(5, 'Type the question').max(4000).optional(),
  marks: marks.optional(),
  answer: z.string().trim().min(10, 'Write (or photograph) your answer first').max(12000, 'Keep the answer under 12000 characters'),
  photoId: objectId.optional(),
  mode: modeSchema,
});
