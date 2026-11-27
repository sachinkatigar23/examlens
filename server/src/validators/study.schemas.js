import { z } from 'zod';

// PATCH /spaces/:spaceId/topics/:topicId/lesson — tick a topic as studied (or untick it).
export const lessonStatusSchema = z.object({ studied: z.boolean() });
