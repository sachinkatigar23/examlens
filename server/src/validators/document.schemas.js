import { z } from 'zod';
import { DOCUMENT_KINDS } from '../models/Document.js';

const thisYear = new Date().getFullYear();

// Multipart fields arrive as strings: "" means "not given", and the year needs coercing to a number.
const blankToUndefined = (v) => (v === '' || v === null ? undefined : v);
const optionalYear = z.preprocess(blankToUndefined, z.coerce.number().int().min(1990).max(thisYear + 1).optional());
// "Unit 2" / "Module 3" (what the syllabus calls it). Missing or "mixed" = the notes cover several units.
const optionalUnit = z.preprocess(
  (v) => (blankToUndefined(v) === undefined || v === 'mixed' ? undefined : v),
  z.string().trim().min(1).max(40).optional(),
);

export const uploadDocumentSchema = z
  .object({
    kind: z.enum(DOCUMENT_KINDS, `Kind must be one of: ${DOCUMENT_KINDS.join(', ')}`),
    year: optionalYear,
    unit: optionalUnit,
  })
  .refine((d) => d.kind !== 'paper' || d.year, {
    message: 'Year is required for question papers',
    path: ['year'],
  })
  .transform((d) => ({
    ...d,
    year: d.kind === 'paper' ? d.year : null,
    unit: d.kind === 'notes' ? (d.unit ?? null) : null,
  }));
