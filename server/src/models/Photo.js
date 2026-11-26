import mongoose from 'mongoose';

// "Snap a doubt": a photographed question or code, stored under storage/uploads/images/.
const photoSchema = new mongoose.Schema(
  {
    space: { type: mongoose.Schema.Types.ObjectId, ref: 'Space', required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    storedName: { type: String, required: true }, // "<uuid>.jpg" inside UPLOAD_DIR/images
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    transcription: { type: String, default: '' },
  },
  { timestamps: true },
);

export const Photo = mongoose.model('Photo', photoSchema);
