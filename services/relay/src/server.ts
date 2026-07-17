import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RelayEnv } from './env.js';
import { generateTurnCredentials, InvalidTurnUsernameError } from './turn-credentials.js';

const turnQuerySchema = z.object({
  username: z.string().min(1).max(256),
});

export function buildRelayServer(env: RelayEnv): FastifyInstance {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    trustProxy: true,
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', env.CORS_ORIGINS);
    reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (request.method === 'OPTIONS') {
      reply.code(204).send();
    }
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: '@nexusdesk/relay',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  }));

  app.get('/ready', async (_request, reply) => {
    reply.code(200);
    return { status: 'ready' };
  });

  app.get('/turn-credentials', async (request, reply) => {
    const parsed = turnQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return { code: 'BAD_REQUEST', message: 'username query parameter is required' };
    }

    try {
      const credentials = generateTurnCredentials(parsed.data.username, env);
      return credentials;
    } catch (error) {
      if (error instanceof InvalidTurnUsernameError) {
        reply.code(400);
        return { code: 'BAD_REQUEST', message: error.message };
      }
      throw error;
    }
  });

  return app;
}
