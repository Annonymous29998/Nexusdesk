import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import { getEnv } from '../config/env.js';

export const corsPlugin = fp(async (app: FastifyInstance) => {
  const env = getEnv();
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (env.CORS_ORIGINS.includes(origin) || env.NODE_ENV === 'development') {
        return cb(null, true);
      }
      return cb(new Error('CORS not allowed'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
}, { name: 'cors-plugin' });
