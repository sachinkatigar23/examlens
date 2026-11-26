import mongoose from 'mongoose';

// A page of the student's notes an answer was taken from. Shared by Message, Answer and Lesson.
export const citationSchema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
    originalName: String,
    page: Number,
    snippet: String,
  },
  { _id: false },
);
