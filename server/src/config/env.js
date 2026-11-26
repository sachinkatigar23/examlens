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
};

export const isProduction = env.nodeEnv === 'production';
