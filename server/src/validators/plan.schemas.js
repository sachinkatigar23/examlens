import { z } from 'zod';
import { isDate } from '../services/planService.js';

const day = z.string().refine(isDate, 'Use a date like 2026-12-04');

export const examDateSchema = z.object({ examDate: day, today: day });
export const tickSchema = z.object({ done: z.boolean(), today: day });
