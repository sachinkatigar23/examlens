import bcrypt from 'bcrypt';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { issueTokens } from '../services/authService.js';
import { REFRESH_COOKIE, clearRefreshCookie, verifyRefreshToken } from '../utils/tokens.js';

const BCRYPT_ROUNDS = 12;
// Compared against when the email doesn't exist, so a wrong email takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

export async function register(req, res) {
  const { name, email, password } = req.body;
  if (await User.exists({ email })) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.create({ name, email, passwordHash });

  const accessToken = await issueTokens(user, res);
  res.status(201).json({ user, accessToken });
}

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash +refreshTokens');
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
  }
  const accessToken = await issueTokens(user, res);
  res.json({ user, accessToken });
}

// Rotation: every refresh token works exactly once. Seeing one used twice means someone copied it,
// so that user is logged out everywhere.
export async function refresh(req, res) {
  const fail = (code, message) => {
    clearRefreshCookie(res);
    throw new AppError(401, code, message);
  };

  const token = req.cookies[REFRESH_COOKIE];
  if (!token) fail('NO_REFRESH_TOKEN', 'Please log in');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    fail('INVALID_REFRESH_TOKEN', 'Your session has expired, please log in again');
  }

  const user = await User.findById(payload.sub).select('+refreshTokens');
  if (!user || user.tokenVersion !== payload.tv) {
    fail('INVALID_REFRESH_TOKEN', 'Your session has expired, please log in again');
  }

  const known = user.refreshTokens.some((t) => t.jti === payload.jti);
  if (!known) {
    user.tokenVersion += 1;
    user.refreshTokens = [];
    await user.save();
    fail('REFRESH_TOKEN_REUSED', 'Your session was ended for safety, please log in again');
  }

  user.refreshTokens = user.refreshTokens.filter((t) => t.jti !== payload.jti);
  const accessToken = await issueTokens(user, res);
  res.json({ user, accessToken });
}

export async function logout(req, res) {
  const token = req.cookies[REFRESH_COOKIE];
  if (token) {
    try {
      const { sub, jti } = verifyRefreshToken(token);
      await User.updateOne({ _id: sub }, { $pull: { refreshTokens: { jti } } });
    } catch {
      // expired or tampered token: nothing to revoke
    }
  }
  clearRefreshCookie(res);
  res.status(204).end();
}

export async function me(req, res) {
  const user = await User.findById(req.user.id);
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Please log in');
  res.json({ user });
}
