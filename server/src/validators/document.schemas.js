import { z } from 'zod';
import { DOCUMENT_KINDS } from '../models/Document.js';

const thisYear = new Date().getFullYear();

// Multipart fields arrive as strings: "" means "not given", and the year needs coercing to a number.
const optionalYear = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.number().int().min(1990).max(thisYear + 1).optional(),
);

export const uploadDocumentSchema = z
  .object({
    kind: z.enum(DOCUMENT_KINDS, `Kind must be one of: ${DOCUMENT_KINDS.join(', ')}`),
    year: optionalYear,
  })
  .refine((d) => d.kind !== 'paper' || d.year, {
    message: 'Year is required for question papers',
    path: ['year'],
  })
  .transform((d) => ({ ...d, year: d.kind === 'paper' ? d.year : null }));
