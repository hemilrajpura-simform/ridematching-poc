/**
 * Express app assembly. Kept separate from server.js so tests can import the app
 * without starting a listener.
 */
import express from 'express';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { logger } from './lib/logger.js';
import { errorHandler } from './lib/errors.js';
import { openapiSpec } from './openapi.js';
import { authRouter } from './routes/auth.routes.js';
import { ridesRouter } from './routes/rides.routes.js';
import { bookingsRouter } from './routes/bookings.routes.js';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(pinoHttp({ logger })); // structured request logs -> req.log

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // API docs — browsable at /docs, raw spec at /openapi.json (importable into Postman etc).
  app.get('/openapi.json', (_req, res) => res.json(openapiSpec));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

  app.use('/auth', authRouter);
  app.use('/rides', ridesRouter);
  app.use('/bookings', bookingsRouter);

  // 404 for anything unmatched.
  app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));

  // Central error handler — MUST be last.
  app.use(errorHandler);
  return app;
}
