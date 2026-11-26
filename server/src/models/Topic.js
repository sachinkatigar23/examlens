import mongoose from 'mongoose';

// Created from a syllabus by the AI service (or, when there is no syllabus, derived from the question bank).
// _id is chosen by the AI service so the same id is used in Qdrant's "topics" collection.
const topicSchema = new mongoose.Schema(
  {
    space: { type: mongoose.Schema.Types.ObjectId, ref: 'Space', required: true, index: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    unit: { type: String, required: true }, // "Unit 3"
    unitTitle: { type: String, default: '' }, // "Knowledge Representation"
    name: { type: String, required: true }, // "Normalization"
    details: { type: String, default: '' }, // sub-topics listed in the syllabus
    order: { type: Number, default: 0 },
    // true = no syllabus was uploaded, so the topic was derived from the question bank. A real syllabus replaces it.
    derived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Topic = mongoose.model('Topic', topicSchema);
