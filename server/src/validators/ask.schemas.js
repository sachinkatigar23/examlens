import { z } from 'zod';

export const askSchema = z.object({
  question: z.string().trim().min(2, 'Type a question first').max(2000, 'Keep the question under 2000 characters'),
});
