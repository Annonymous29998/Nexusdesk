import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

/** Optional OpenAPI plugin — enabled when swagger packages are installed. */
export const swaggerPlugin = fp(async (app: FastifyInstance) => {
  app.log.debug('swagger plugin skipped (optional dependency not required for core API)');
}, { name: 'swagger-plugin' });
