import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export const prismaPlugin = fp(async (app: FastifyInstance) => {
  const prisma = new PrismaClient({
    log: app.log.level === 'debug' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      await prisma.$connect();
      lastError = undefined;
      break;
    } catch (err) {
      lastError = err;
      app.log.warn({ attempt, err: (err as Error).message }, 'prisma connect failed — retrying');
      await new Promise((r) => setTimeout(r, Math.min(attempt * 1500, 8000)));
    }
  }
  if (lastError) throw lastError;

  app.decorate('prisma', prisma);
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
}, { name: 'prisma-plugin' });
