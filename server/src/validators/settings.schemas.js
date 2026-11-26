import { z } from 'zod';

export const settingsSchema = z
  .object({
    defaultMode: z.enum(['local', 'cloud']).optional(),
    cloudNoticeSeen: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, 'Nothing to update');
