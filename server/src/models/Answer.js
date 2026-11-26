import mongoose from 'mongoose';
import { citationSchema } from './citationSchema.js';

// A cached exam answer for one question (question bank or past paper). Generated once; "Regenerate"
// replaces it. One answer per question.
const answerSchema = new mongoose.Schema(
  {
    space: { type: mongoose.Schema.Types.ObjectId, ref: 'Space', required: true, index: true },
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true, unique: true },
    marks: { type: Number, required: true },
    provider: { type: String, enum: ['local', 'cloud'], required: true },
    model: { type: String, required: true },
    content: { type: String, required: true },
    citations: { type: [citationSchema], default: [] },
    grounded: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Answer = mongoose.model('Answer', answerSchema);
