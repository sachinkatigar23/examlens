import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  // credentials: true lets the browser send the refresh-token cookie from the React app.
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  if (env.nodeEnv !== 'test') app.use(morgan('dev'));

  app.use('/api/v1', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
