import { z } from 'zod';

// Building blocks shared by the feature schemas.
export const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id');
export const modeSchema = z.enum(['local', 'cloud']).default('local'); // which model writes the answer
export const marks = z.number().int().min(1).max(30);

// Anything that generates text from the notes: an exam answer, a lesson, a revision sheet.
export const generateSchema = z.object({
  mode: modeSchema,
  marks: marks.optional(),
});
