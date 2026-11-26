import mongoose from 'mongoose';

// One question from a past paper. Questions reference a Topic (many → one) so the Analyzer can
// $group them by topic and year.
const questionSchema = new mongoose.Schema(
  {
    space: { type: mongoose.Schema.Types.ObjectId, ref: 'Space', required: true, index: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    year: { type: Number, required: true },
    number: { type: String, default: '' }, // "2b"
    text: { type: String, required: true },
    marks: { type: Number, default: null },
    topic: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', default: null },
    matchScore: { type: Number, default: null },
    // Same value = the same question asked in different years. A question that was never repeated
    // has a group of its own (its own id), so only groups spanning 2+ years count as repeats.
    repeatGroup: { type: String, default: null },
  },
  { timestamps: true },
);

questionSchema.index({ space: 1, topic: 1, year: 1 });

export const Question = mongoose.model('Question', questionSchema);
