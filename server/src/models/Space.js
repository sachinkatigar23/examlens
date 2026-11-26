import mongoose from 'mongoose';

const spaceSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    subject: { type: String, trim: true, default: '' },
    color: { type: String, default: '#1B2A4A' },
  },
  { timestamps: true },
);

export const Space = mongoose.model('Space', spaceSchema);
