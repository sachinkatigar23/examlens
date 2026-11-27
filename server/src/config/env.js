import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Paths in .env are relative to the server/ folder, not to wherever node was started from.
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(serverRoot, '.env'), quiet: true });

const required = ['MONGO_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'SERVICE_KEY'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing env vars: ${missing.join(', ')} — copy server/.env.example to server/.env`);
  process.exit(1);
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTokenTtl: process.env.REFRESH_TOKEN_TTL || '7d',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  aiServiceUrl: process.env.AI_SERVICE_URL || 'http://localhost:8000',
  serviceKey: process.env.SERVICE_KEY,
  uploadDir: path.resolve(serverRoot, process.env.UPLOAD_DIR || '../storage/uploads'),
  // Number of proxies in front of the app (1 behind the nginx container) so req.ip is the real client.
  trustProxy: Number(process.env.TRUST_PROXY) || 0,

  // Public demo (docker-compose.prod.yml): sign-ups closed, the demo account is read-only, stricter limits.
  publicDemo: process.env.PUBLIC_DEMO === 'true',
  demoEmail: (process.env.DEMO_EMAIL || 'demo@examlens.local').toLowerCase(),
  demoPassword: process.env.DEMO_PASSWORD || '', // shown on the login page so visitors can get in
  demoCloudPerIp: Number(process.env.DEMO_CLOUD_PER_IP) || 5, // Cloud answers per visitor IP per day
  demoAskPerIp: Number(process.env.DEMO_ASK_PER_IP) || 30, // AI answers (any model) per visitor IP per day
  demoMaxConcurrent: Number(process.env.DEMO_MAX_CONCURRENT) || 2, // answers generated at once (CPU-only box)
};

export const isProduction = env.nodeEnv === 'production';
// Secure cookies need https. Docker on localhost is plain http, so it can be switched off explicitly.
export const cookieSecure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : isProduction;
