import mongoose from 'mongoose';

// A long background generation ("Answer all" in the Question Bank). Progress lives here so the UI can poll
// it and a restarted server can resume it (already answered questions are skipped).
const jobSchema = new mongoose.Schema(
  {
    space: { type: mongoose.Schema.Types.ObjectId, ref: 'Space', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['answer-all'], required: true },
    status: { type: String, enum: ['running', 'done', 'failed', 'cancelled'], default: 'running' },
    mode: { type: String, enum: ['local', 'cloud'], default: 'local' },
    unit: { type: String, default: null }, // null = the whole bank
    total: { type: Number, default: 0 },
    done: { type: Number, default: 0 },
    current: { type: String, default: null }, // question being answered now
    error: { type: String, default: null },
    errorCode: { type: String, default: null },
  },
  { timestamps: true },
);

export const Job = mongoose.model('Job', jobSchema);
