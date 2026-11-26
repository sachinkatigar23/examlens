import { signAccessToken, signRefreshToken, setRefreshCookie } from '../utils/tokens.js';

const MAX_SESSIONS = 5; // devices a user can stay logged in on at once

// Creates a new access token + refresh token, remembers the refresh token's id on the user,
// and sets it as an httpOnly cookie. `user` must be loaded with +refreshTokens.
export async function issueTokens(user, res) {
  const { token, jti, expiresAt } = signRefreshToken(user);

  const stillValid = user.refreshTokens.filter((t) => t.expiresAt > new Date());
  user.refreshTokens = [...stillValid, { jti, expiresAt }].slice(-MAX_SESSIONS);
  await user.save();

  setRefreshCookie(res, token, expiresAt);
  return signAccessToken(user);
}
