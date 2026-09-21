import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';

import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';
import { requireAuth } from './middleware/auth.middleware.js';
import { adminRouter } from './routes/admin.routes.js';
import { employeeRouter } from './routes/employee.routes.js';
import { competencyRouter } from './routes/competency.routes.js';
import { crmRouter } from './routes/crm.routes.js';
import { aiAnalysisRouter } from './routes/ai_analysis.routes.js';
import { tnaRouter } from './routes/tna.routes.js';
import { trainingRouter } from './routes/training.routes.js';
import { kpiDashboardRouter } from './routes/kpi_dashboard.routes.js';
import { catalogRouter } from './routes/catalog.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { integrationRouter } from './routes/integration.routes.js';
import { progressRouter } from './routes/progress.routes.js';
import { sessionRouter } from './routes/session.routes.js';
import { theoryRouter } from './routes/theory.routes.js';

export function createApp(): express.Application {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: env.corsOrigins }));
  // Bounded bodies: the JSON endpoints take short texts and small context blobs.
  // Audio goes through multer, which enforces its own 15 MB cap. Without a limit
  // here, one client could buffer gigabytes of JSON into memory.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));
  // Skip the Live relay: clients may pass their JWT as ?token=, which must not
  // end up in the access log.
  app.use(
    morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', {
      skip: (req) => req.url?.startsWith('/api/trainer/live/') === true,
    }),
  );

  // Public
  app.use('/health', healthRouter);

  // Authenticated (shared JWT from Sales Analytics)
  app.use('/api/trainer', catalogRouter);
  app.use('/api/trainer', employeeRouter);
  app.use('/api/trainer', competencyRouter);
  app.use('/api/trainer', crmRouter);
  app.use('/api/trainer', aiAnalysisRouter);
  app.use('/api/trainer', tnaRouter);
  app.use('/api/trainer', trainingRouter);
  app.use('/api/trainer', kpiDashboardRouter);
  app.use('/api/trainer', sessionRouter);
  app.use('/api/trainer', progressRouter);
  app.use('/api/trainer', theoryRouter);

  // Sales Analytics integration: inbound assignment + outbox administration.
  app.use('/api/trainer', integrationRouter);

  // Admin-only. requireAuth MUST run first: requireAdmin reads req.user, so
  // mounting the router alone would reject even a valid admin token.
  app.use('/api/trainer/admin', requireAuth, adminRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
