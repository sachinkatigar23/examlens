import mongoose from 'mongoose';

// Created from a syllabus by the AI service. _id is chosen by the AI service so the same id is used
// in Qdrant's "topics" collection.
const topicSchema = new mongoose.Schema(
  {
    space: { type: mongoose.Schema.Types.ObjectId, ref: 'Space', required: true, index: true },
    document: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', required: true },
    unit: { type: String, required: true }, // "Unit 3"
    name: { type: String, required: true }, // "Normalization"
    details: { type: String, default: '' }, // sub-topics listed in the syllabus
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Topic = mongoose.model('Topic', topicSchema);
