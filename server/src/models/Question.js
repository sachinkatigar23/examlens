import mongoose from 'mongoose';

// One question from a past paper (kind 'paper') or from the college question bank (kind 'important').
// Questions reference a Topic (many → one) so the Analyzer can $group them by topic and year.
const questionSchema = new mongoose.Schema(
  {
    space: { type: mongoose.Schema.Types.ObjectId, ref: 'Space', required: true, index: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    kind: { type: String, enum: ['paper', 'important'], default: 'paper' },
    year: { type: Number, default: null }, // papers only
    unit: { type: String, default: null }, // question bank: from its "UNIT – II" heading
    number: { type: String, default: '' }, // "2b", or "U2-10M3" in the question bank
    text: { type: String, required: true },
    marks: { type: Number, default: null },
    marksEdited: { type: Boolean, default: false }, // the student corrected the marks by hand
    topic: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', default: null },
    matchScore: { type: Number, default: null },
    // true once the student moved the question to a topic by hand: automatic re-matching leaves it alone.
    topicLocked: { type: Boolean, default: false },
    // Same value = the same question asked in different years (or a bank question also asked in a paper).
    // A question that was never repeated has a group of its own (its own id).
    repeatGroup: { type: String, default: null },
  },
  { timestamps: true },
);

questionSchema.index({ space: 1, topic: 1, year: 1 });
questionSchema.index({ space: 1, kind: 1, unit: 1 });

// The Analyzer only looks at past papers. `$ne` also matches questions saved before `kind` existed.
export const PAPERS_ONLY = { kind: { $ne: 'important' } };

export const Question = mongoose.model('Question', questionSchema);
