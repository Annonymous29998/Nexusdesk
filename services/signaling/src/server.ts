import websocketPlugin from '@fastify/websocket';
import { signalingMessageSchema, type SignalingMessageParsed } from '@nexusdesk/shared';
import { SignalingMessageType } from '@nexusdesk/types';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RawData, WebSocket } from 'ws';
import { extractToken, SignalingAuthError, verifySignalingToken } from './auth.js';
import type { SignalingEnv } from './env.js';
import { RoomCapacityError, RoomManager, type RoomPeer } from './rooms.js';

const wsQuerySchema = z.object({
  sessionId: z.string().min(1).max(128),
  token: z.string().optional(),
});

/** Application-level control frames layered on top of the signaling protocol. */
const controlMessageSchema = z.object({
  type: z.enum(['ping', 'pong']),
  timestamp: z.number().int().positive().optional(),
});

const inboundMessageSchema = z.union([signalingMessageSchema, controlMessageSchema]);

export interface SignalingServer {
  app: FastifyInstance;
  rooms: RoomManager;
  close(): Promise<void>;
}

function buildErrorEnvelope(
  sessionId: string,
  connectionId: string,
  toPeerId: string,
  code: string,
  message: string,
): SignalingMessageParsed {
  return {
    type: SignalingMessageType.Error,
    sessionId,
    connectionId,
    fromPeerId: 'signaling-server',
    toPeerId,
    timestamp: Date.now(),
    payload: { code, message },
  };
}

function safeSend(socket: WebSocket, data: unknown): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(data));
}

export function buildSignalingServer(env: SignalingEnv): SignalingServer {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
    trustProxy: true,
  });

  const rooms = new RoomManager(env.SIGNALING_MAX_PEERS_PER_ROOM);

  app.register(websocketPlugin, {
    options: {
      maxPayload: env.SIGNALING_MAX_MESSAGE_BYTES,
    },
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: '@nexusdesk/signaling',
    uptimeSeconds: Math.floor(process.uptime()),
    rooms: rooms.roomCount(),
    peers: rooms.peerCount(),
    timestamp: new Date().toISOString(),
  }));

  app.get('/ready', async (_request, reply) => {
    reply.code(200);
    return { status: 'ready' };
  });

  app.register(async (instance) => {
    instance.get('/ws', { websocket: true }, (socket: WebSocket, request) => {
      const rawQuery = request.query as Record<string, unknown>;
      const queryResult = wsQuerySchema.safeParse(rawQuery);

      if (!queryResult.success) {
        socket.close(4000, 'sessionId query parameter is required');
        return;
      }

      const { sessionId } = queryResult.data;
      const token = extractToken(rawQuery, request.headers.authorization);

      if (!token) {
        socket.close(4001, 'Missing authentication token');
        return;
      }

      let authenticated;
      try {
        authenticated = verifySignalingToken(token, env);
      } catch (error) {
        const message = error instanceof SignalingAuthError ? error.message : 'Authentication failed';
        app.log.warn({ err: error }, 'signaling auth rejected');
        socket.close(4003, message.slice(0, 120));
        return;
      }

      const peer: RoomPeer = {
        peerId: authenticated.peerId,
        organizationId: authenticated.organizationId,
        socket,
        isAlive: true,
        joinedAt: Date.now(),
        lastSeenAt: Date.now(),
      };

      try {
        rooms.join(sessionId, peer);
      } catch (error) {
        if (error instanceof RoomCapacityError) {
          socket.close(4008, error.message);
          return;
        }
        throw error;
      }

      app.log.info(
        { sessionId, peerId: peer.peerId, org: authenticated.organizationId },
        'peer joined signaling room',
      );

      socket.on('pong', () => {
        peer.isAlive = true;
        peer.lastSeenAt = Date.now();
      });

      socket.on('message', (raw: RawData) => {
        peer.isAlive = true;
        peer.lastSeenAt = Date.now();

        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(raw.toString());
        } catch {
          safeSend(socket, buildErrorEnvelope(sessionId, 'n/a', peer.peerId, 'BAD_JSON', 'Message must be valid JSON'));
          return;
        }

        const result = inboundMessageSchema.safeParse(parsedJson);
        if (!result.success) {
          safeSend(
            socket,
            buildErrorEnvelope(sessionId, 'n/a', peer.peerId, 'VALIDATION', 'Message failed schema validation'),
          );
          return;
        }

        const message = result.data;

        if (message.type === 'ping') {
          safeSend(socket, { type: 'pong', timestamp: message.timestamp ?? Date.now() });
          return;
        }

        if (message.type === 'pong') {
          return;
        }

        // From here on, `message` is a SignalingMessage envelope to relay
        // (ping/pong control frames were already handled and returned above).
        const envelope = message as SignalingMessageParsed;

        if (envelope.fromPeerId !== peer.peerId) {
          safeSend(
            socket,
            buildErrorEnvelope(sessionId, envelope.connectionId, peer.peerId, 'FORBIDDEN', 'fromPeerId must match authenticated peer'),
          );
          return;
        }

        const target = rooms.getPeer(sessionId, envelope.toPeerId);
        if (!target) {
          safeSend(
            socket,
            buildErrorEnvelope(
              sessionId,
              envelope.connectionId,
              peer.peerId,
              'PEER_NOT_FOUND',
              `Peer ${envelope.toPeerId} is not present in room ${sessionId}`,
            ),
          );
          return;
        }

        safeSend(target.socket, envelope);
      });

      const cleanup = (): void => {
        rooms.leave(sessionId, peer.peerId);
        app.log.info({ sessionId, peerId: peer.peerId }, 'peer left signaling room');
      };

      socket.on('close', cleanup);
      socket.on('error', (error) => {
        app.log.warn({ err: error, sessionId, peerId: peer.peerId }, 'signaling socket error');
        cleanup();
      });
    });
  });

  const heartbeatTimer = setInterval(() => {
    const now = Date.now();
    for (const { sessionId, peer } of rooms.allPeers()) {
      if (now - peer.lastSeenAt > env.SIGNALING_HEARTBEAT_TIMEOUT_MS) {
        app.log.warn({ sessionId, peerId: peer.peerId }, 'peer heartbeat timed out, terminating');
        peer.socket.terminate();
        rooms.leave(sessionId, peer.peerId);
        continue;
      }

      if (peer.socket.readyState === peer.socket.OPEN) {
        peer.isAlive = false;
        peer.socket.ping();
      }
    }
  }, env.SIGNALING_HEARTBEAT_INTERVAL_MS);

  heartbeatTimer.unref();

  return {
    app,
    rooms,
    async close() {
      clearInterval(heartbeatTimer);
      await app.close();
    },
  };
}
