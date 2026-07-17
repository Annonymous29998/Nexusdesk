import fp from 'fastify-plugin';
import { Redis } from 'ioredis';
import type { FastifyInstance } from 'fastify';
import { getEnv } from '../config/env.js';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

export const redisPlugin = fp(async (app: FastifyInstance) => {
  const env = getEnv();
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableOfflineQueue: false,
    keyPrefix: env.REDIS_PREFIX,
    // Stop reconnecting after a few attempts so a missing Redis doesn't flood
    // the logs. The app falls back to an in-memory store when Redis is absent.
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
  });

  // Prevent ioredis from throwing "Unhandled error event" when Redis is down.
  redis.on('error', () => {
    /* handled via warn below / in-memory fallback */
  });

  try {
    await redis.connect();
    await redis.ping();
    app.log.info('redis connected');
  } catch (err) {
    app.log.warn(
      { err: (err as Error).message },
      'redis unavailable — using in-memory fallback',
    );
  }

  app.decorate('redis', redis);
  app.addHook('onClose', async () => {
    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
  });
}, { name: 'redis-plugin' });
