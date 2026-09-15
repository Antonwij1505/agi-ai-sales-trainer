import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';
import { catalogRouter } from './routes/catalog.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { progressRouter } from './routes/progress.routes.js';
import { sessionRouter } from './routes/session.routes.js';

export function createApp(): express.Application {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.corsOrigins }));
  app.use(express.json({ limit: '2mb' }));
  app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  // Public
  app.use('/health', healthRouter);

  // Authenticated (shared JWT from Sales Analytics)
  app.use('/api/trainer', catalogRouter);
  app.use('/api/trainer', sessionRouter);
  app.use('/api/trainer', progressRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
