import { isDemoUser } from '../utils/demo.js';
import { signAccessToken, signRefreshToken, setRefreshCookie } from '../utils/tokens.js';

const MAX_SESSIONS = 5; // devices a user can stay logged in on at once

// Creates a new access token + refresh token, remembers the refresh token's id on the user,
// and sets it as an httpOnly cookie. `user` must be loaded with +refreshTokens.
export async function issueTokens(user, res) {
  const { token, jti, expiresAt } = signRefreshToken(user);

  // The public demo account is shared by every visitor: remembering only the last 5 sessions would log the
  // 6th visitor's predecessors out (and look like token theft). Its refresh tokens are only signature-checked.
  if (isDemoUser(user)) {
    setRefreshCookie(res, token, expiresAt);
    return signAccessToken(user);
  }

  const stillValid = user.refreshTokens.filter((t) => t.expiresAt > new Date());
  user.refreshTokens = [...stillValid, { jti, expiresAt }].slice(-MAX_SESSIONS);
  await user.save();

  setRefreshCookie(res, token, expiresAt);
  return signAccessToken(user);
}
