import fp from 'fastify-plugin';
import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import { registerSocketHandlers } from '../sockets/index.js';

export const websocketPlugin = fp(async (app: FastifyInstance) => {
  await app.register(websocket, {
    options: {
      // JPEG frames are base64 JSON — allow large payloads.
      maxPayload: 16 * 1024 * 1024,
    },
  });
  registerSocketHandlers(app);
}, { name: 'websocket-plugin' });
