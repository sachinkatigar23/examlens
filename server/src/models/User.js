import mongoose from 'mongoose';
import { isDemoUser } from '../utils/demo.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    // Bump to invalidate every refresh token this user has (log out all devices).
    tokenVersion: { type: Number, default: 0 },
    // Refresh tokens that are still allowed. Each refresh removes the used one (rotation);
    // presenting a token that is no longer here means it was stolen and replayed.
    // Default chat model: 'local' (Ollama, private) or 'cloud' (Gemini). The Cloud privacy note is shown once.
    settings: {
      defaultMode: { type: String, enum: ['local', 'cloud'], default: 'local' },
      cloudNoticeSeen: { type: Boolean, default: false },
    },
    refreshTokens: {
      type: [{ jti: String, expiresAt: Date, _id: false }],
      default: [],
      select: false,
    },
  },
  { timestamps: true },
);

userSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.refreshTokens;
    delete ret.tokenVersion;
    // The public demo account: the client hides upload/edit/delete, and answers default to Cloud (the client
    // still falls back to Local when Cloud isn't set up). Its own settings are never saved (read-only).
    if (isDemoUser(ret)) {
      ret.readOnly = true;
      ret.settings = { defaultMode: 'cloud', cloudNoticeSeen: true };
    }
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
