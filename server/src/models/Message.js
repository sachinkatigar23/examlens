import mongoose from 'mongoose';
import { citationSchema } from './citationSchema.js';

// Chat history, one document per message.
const messageSchema = new mongoose.Schema(
  {
    space: { type: mongoose.Schema.Types.ObjectId, ref: 'Space', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    citations: { type: [citationSchema], default: [] },
    // 'ask' = the Ask tab; 'study:Unit 2' = the follow-up chat under a lesson of that unit
    thread: { type: String, default: 'ask' },
    provider: { type: String, enum: ['local', 'cloud', null], default: null }, // which model wrote it
    model: { type: String, default: null },
    marks: { type: Number, default: null },
    photo: { type: mongoose.Schema.Types.ObjectId, ref: 'Photo', default: null }, // "Snap a doubt" question
  },
  { timestamps: true },
);

messageSchema.index({ space: 1, thread: 1, createdAt: -1 });

export const Message = mongoose.model('Message', messageSchema);
