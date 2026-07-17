import type { FastifyInstance } from 'fastify';
import { API_ROUTES } from '@nexusdesk/shared';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get(API_ROUTES.health, async () => ({
    status: 'ok',
    service: 'nexusdesk-api',
    time: new Date().toISOString(),
  }));

  app.get(API_ROUTES.ready, async (_req, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      let redisOk = false;
      try {
        const pong = await app.redis.ping();
        redisOk = pong === 'PONG';
      } catch {
        redisOk = false;
      }
      return { status: 'ready', database: true, redis: redisOk };
    } catch {
      return reply.status(503).send({ status: 'not_ready', database: false });
    }
  });
}
