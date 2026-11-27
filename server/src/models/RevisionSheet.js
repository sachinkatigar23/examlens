import mongoose from 'mongoose';
import { citationSchema } from './citationSchema.js';

// Last-night revision sheet: one printable page per unit (definitions, diagrams, formulas/code, must-remember).
// Generated once from the notes and cached; "Regenerate" replaces it. The top questions on the page are
// computed from the question data each time, not generated.
const revisionSheetSchema = new mongoose.Schema(
  {
    space: { type: mongoose.Schema.Types.ObjectId, ref: 'Space', required: true },
    unit: { type: String, required: true },
    content: { type: String, required: true },
    citations: { type: [citationSchema], default: [] },
    provider: { type: String, enum: ['local', 'cloud'] },
    model: String,
  },
  { timestamps: true },
);

revisionSheetSchema.index({ space: 1, unit: 1 }, { unique: true });

export const RevisionSheet = mongoose.model('RevisionSheet', revisionSheetSchema);
