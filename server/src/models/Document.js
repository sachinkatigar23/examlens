import mongoose from 'mongoose';

// important = the college's "important questions" PDF (Question Bank)
export const DOCUMENT_KINDS = ['notes', 'syllabus', 'paper', 'important'];
export const DOCUMENT_STATUSES = ['queued', 'processing', 'ready', 'failed'];

const documentSchema = new mongoose.Schema(
  {
    space: { type: mongoose.Schema.Types.ObjectId, ref: 'Space', required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: DOCUMENT_KINDS, required: true },
    year: { type: Number, default: null }, // papers only
    unit: { type: String, default: null }, // notes only: "Unit 2", or null = mixed / whole subject
    originalName: { type: String, required: true },
    storedName: { type: String, required: true }, // file name inside UPLOAD_DIR
    sizeBytes: { type: Number, required: true },
    pages: { type: Number, default: null },
    status: { type: String, enum: DOCUMENT_STATUSES, default: 'queued' },
    error: { type: String, default: null },
    chunkCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Document = mongoose.model('Document', documentSchema);
