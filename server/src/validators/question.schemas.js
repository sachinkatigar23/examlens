import { z } from 'zod';

// PATCH /spaces/:spaceId/questions/:questionId — move a question to another topic (null = no topic).
export const moveQuestionSchema = z.object({
  topicId: z
    .string()
    .regex(/^[a-f0-9]{24}$/, 'topicId must be a topic id')
    .nullable(),
});
