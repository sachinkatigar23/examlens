import mongoose from 'mongoose';
import { citationSchema } from './citationSchema.js';

// "Check my answer": one attempt at a question (from the bank / a paper, or typed by the student), with the
// estimated marks and feedback. Every attempt is kept, so progress on a question is visible over time.
const checkItemSchema = new mongoose.Schema({ item: String, ok: Boolean, note: String }, { _id: false });
const markPartSchema = new mongoose.Schema({ part: String, got: Number, max: Number }, { _id: false });

const answerCheckSchema = new mongoose.Schema(
  {
    space: { type: mongoose.Schema.Types.ObjectId, ref: 'Space', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', default: null }, // null = typed question
    questionText: { type: String, required: true },
    marks: { type: Number, required: true },
    answerText: { type: String, required: true }, // what the student wrote (typed, or the corrected transcription)
    photo: { type: mongoose.Schema.Types.ObjectId, ref: 'Photo', default: null },
    // The verdict. estimatedMarks is an ESTIMATE (a model grading against the notes), labelled as such in the UI.
    estimatedMarks: { type: Number, required: true },
    breakdown: { type: [markPartSchema], default: [] }, // where the marks came from: Content 2.5/6, Diagram 0/1.5…
    covered: { type: [String], default: [] },
    missing: { type: [String], default: [] },
    mistakes: { type: [String], default: [] },
    feedback: { type: String, default: '' },
    checklist: { type: [checkItemSchema], default: [] }, // format checks done in code (diagram, example, length…)
    wordCount: Number,
    notesCover: { type: Boolean, default: true },
    improved: { type: String, default: '' }, // the student's answer rewritten to full marks, cited [p. N]
    citations: { type: [citationSchema], default: [] },
    provider: { type: String, enum: ['local', 'cloud'] },
    model: String,
  },
  { timestamps: true },
);

answerCheckSchema.index({ space: 1, question: 1, createdAt: -1 });

export const AnswerCheck = mongoose.model('AnswerCheck', answerCheckSchema);
