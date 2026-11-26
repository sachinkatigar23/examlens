import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';

try {
  await connectDB();
} catch (err) {
  console.error(`Could not connect to MongoDB at ${env.mongoUri}. Is "docker compose up -d" running?`);
  console.error(err.message);
  process.exit(1);
}

createApp().listen(env.port, () => {
  console.log(`ExamLens API listening on http://localhost:${env.port}/api/v1`);
});
