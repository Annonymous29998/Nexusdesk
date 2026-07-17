import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { createApiError, ERROR_CODES } from '@nexusdesk/shared';
import { getEnv } from './config/env.js';
import { AppError } from './domain/errors/app-error.js';
import { createLoggerOptions } from './lib/logger.js';
import { corsPlugin } from './plugins/cors.js';
import { helmetPlugin } from './plugins/helmet.js';
import { prismaPlugin } from './plugins/prisma.js';
import { redisPlugin } from './plugins/redis.js';
import { websocketPlugin } from './plugins/websocket.js';
import { registerRoutes } from './routes/index.js';
import { startOfflineDeviceWorker } from './workers/offline-devices.js';

export async function buildApp(options?: { logger?: boolean }) {
  const env = getEnv();
  const app = Fastify({
    logger: options?.logger === false ? false : createLoggerOptions(env),
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
    genReqId: () => crypto.randomUUID(),
    pluginTimeout: 120_000,
  });

  await app.register(sensible);
  await app.register(cookie, { secret: env.SESSION_SECRET });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX_REQUESTS,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
  });
  await app.register(corsPlugin);
  await app.register(helmetPlugin);
  await app.register(prismaPlugin);
  await app.register(redisPlugin);
  await app.register(websocketPlugin);
  await registerRoutes(app);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(
        createApiError(error.code, error.message, error.details),
      );
    }
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err: error }, 'unhandled error');
    }
    return reply.status(status).send(
      createApiError(
        status === 400 ? ERROR_CODES.BAD_REQUEST : ERROR_CODES.INTERNAL,
        status >= 500 ? 'Internal server error' : (error as Error).message,
      ),
    );
  });

  app.addHook('onReady', async () => {
    startOfflineDeviceWorker(app);
  });

  return app;
}
