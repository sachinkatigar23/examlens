import mongoose from 'mongoose';

const citationSchema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
    originalName: String,
    page: Number,
    snippet: String,
  },
  { _id: false },
);

// Ask ExamLens chat history, one document per message.
const messageSchema = new mongoose.Schema(
  {
    space: { type: mongoose.Schema.Types.ObjectId, ref: 'Space', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    citations: { type: [citationSchema], default: [] },
  },
  { timestamps: true },
);

messageSchema.index({ space: 1, createdAt: -1 });

export const Message = mongoose.model('Message', messageSchema);
