import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env.js';
import routes from './routes/index.js';
import internalRoutes from './routes/internalRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', env.trustProxy);

  app.use(helmet());
  if (env.nodeEnv !== 'test') app.use(morgan('dev'));
  // Mounted before the global JSON parser: it has its own larger body limit and needs no CORS.
  app.use('/api/v1/internal', internalRoutes);
  // credentials: true lets the browser send the refresh-token cookie from the React app.
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api/v1', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
