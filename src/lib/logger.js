/**
 * Structured JSON logging with pino. Structured (not console.log strings) so the
 * audit trail and request logs are machine-queryable — which is exactly what the
 * spec asks for ("a structured trace ... evidence if a rider disputes a charge").
 */
import pino from 'pino';
import { env, isProd } from '../env.js';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  // Pretty output in dev is nice, but keep raw JSON in prod for log aggregators.
  transport: isProd ? undefined : { target: 'pino-pretty', options: { colorize: true } },
});
