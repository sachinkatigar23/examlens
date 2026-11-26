import mongoose from 'mongoose';
import { citationSchema } from './citationSchema.js';

// Study mode: the from-scratch lesson for one syllabus topic. Generated once, cached; "Regenerate" replaces it.
const lessonSchema = new mongoose.Schema(
  {
    space: { type: mongoose.Schema.Types.ObjectId, ref: 'Space', required: true },
    topic: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true },
    unit: { type: String, default: null },
    content: { type: String, default: '' },
    citations: { type: [citationSchema], default: [] },
    provider: { type: String, enum: ['local', 'cloud'] },
    model: String,
    grounded: { type: Boolean, default: true },
    studied: { type: Boolean, default: false }, // ticked by the student (used by the Tier 2 planner)
  },
  { timestamps: true },
);

lessonSchema.index({ space: 1, topic: 1 }, { unique: true });

export const Lesson = mongoose.model('Lesson', lessonSchema);
