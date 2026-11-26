import { z } from 'zod';

const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'Must be a 24-character hex id');

const topic = z.object({
  id: objectId,
  unit: z.string().min(1).max(60),
  unit_title: z.string().max(200).optional().default(''),
  name: z.string().min(1).max(200),
  details: z.string().max(2000).optional().default(''),
  order: z.number().int(),
  derived: z.boolean().optional().default(false),
});

const question = z.object({
  id: objectId,
  number: z.string().max(20).optional().default(''),
  text: z.string().min(1).max(5000),
  marks: z.number().int().nullable().optional().default(null),
  unit: z.string().max(60).nullable().optional().default(null),
  topic_id: objectId.nullable(),
  match_score: z.number().nullable(),
  repeat_group: z.string().max(40).nullable(),
});

// What the AI service sends to PATCH /internal/documents/:id
export const documentUpdateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('processing') }),
  z.object({ status: z.literal('failed'), error: z.string().max(500) }),
  z.object({
    status: z.literal('ready'),
    pages: z.number().int().min(0),
    chunkCount: z.number().int().min(0),
    topics: z.array(topic).max(500).optional(),
    questions: z.array(question).max(1000).optional(),
  }),
]);
