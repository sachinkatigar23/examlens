import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    // Bump to invalidate every refresh token this user has (log out all devices).
    tokenVersion: { type: Number, default: 0 },
    // Refresh tokens that are still allowed. Each refresh removes the used one (rotation);
    // presenting a token that is no longer here means it was stolen and replayed.
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
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
