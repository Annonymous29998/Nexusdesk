import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { getEnv } from '../config/env.js';

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
  const env = getEnv();
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX_REQUESTS,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    redis: app.redis?.status === 'ready' ? app.redis : undefined,
    nameSpace: `${env.REDIS_PREFIX}rl:`,
    allowList: (req) => req.url === '/health' || req.url === '/ready',
  });
}
