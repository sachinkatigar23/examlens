import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { getProviders, isAiHealthy } from '../services/aiService.js';

// GET /health — the app still works without the AI service (login, uploads queue up), so only MongoDB decides
// the status code.
export async function health(_req, res) {
  const mongoOk = mongoose.connection.readyState === 1;
  const ai = await isAiHealthy();
  res.status(mongoOk ? 200 : 503).json({ status: mongoOk ? 'ok' : 'degraded', mongo: mongoOk, ai });
}

// GET /ai/providers — what the Local / Cloud toggle can offer right now (Cloud needs GEMINI_API_KEY).
export async function providers(_req, res) {
  res.json(await getProviders());
}

// GET /config — what the client needs before anyone logs in: is this the public demo (banner, sign-ups
// closed, a "use the demo account" button)? The demo password is public on purpose: it's a shared demo.
export function publicConfig(_req, res) {
  res.json({
    publicDemo: env.publicDemo,
    registrationOpen: !env.publicDemo,
    demoAccount: env.publicDemo && env.demoPassword ? { email: env.demoEmail, password: env.demoPassword } : null,
  });
}
