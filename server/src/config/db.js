import mongoose from 'mongoose';
import { env } from './env.js';

// Hide internal fields from every JSON response.
mongoose.set('toJSON', { versionKey: false });

export async function connectDB() {
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 5000 });
  console.log(`MongoDB connected: ${mongoose.connection.name}`);
}
