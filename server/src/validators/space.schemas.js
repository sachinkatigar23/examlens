import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #D7452C');

export const createSpaceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  subject: z.string().trim().max(80).optional(),
  color: hexColor.optional(),
});

export const updateSpaceSchema = createSpaceSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, 'Nothing to update');
