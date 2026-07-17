import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { WS_EVENTS } from '@nexusdesk/shared';
import { verifyAccessToken, verifyAgentToken } from '../lib/tokens.js';
import { DevicesService } from '../services/devices.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('socket');

type PeerRole = 'viewer' | 'agent';

interface SocketClient {
  socket: WebSocket;
  role: PeerRole;
  userId?: string;
  deviceId?: string;
  organizationId: string;
  sessionId?: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    agentGateway: {
      sendCommand: (deviceId: string, command: unknown) => boolean;
      isOnline: (deviceId: string) => boolean;
    };
  }
}

export function registerSocketHandlers(app: FastifyInstance): void {
  const agents = new Map<string, SocketClient>();
  const sessionRooms = new Map<string, Set<SocketClient>>();
  // Active screen-stream sessions: sessionId -> { deviceId, viewers }.
  const streamSessions = new Map<string, { deviceId: string; viewers: Set<SocketClient> }>();

  function stopStreaming(client: SocketClient) {
    if (client.role !== 'viewer' || !client.sessionId) return;
    const entry = streamSessions.get(client.sessionId);
    if (!entry) return;
    entry.viewers.delete(client);
    if (entry.viewers.size === 0) {
      app.agentGateway.sendCommand(entry.deviceId, {
        type: 'stop_stream',
        payload: { sessionId: client.sessionId },
      });
      streamSessions.delete(client.sessionId);
    }
  }

  app.decorate('agentGateway', {
    sendCommand(deviceId: string, command: unknown) {
      const client = agents.get(deviceId);
      if (!client || client.socket.readyState !== 1) return false;
      client.socket.send(JSON.stringify({ event: WS_EVENTS.agentCommand, data: command }));
      return true;
    },
    isOnline(deviceId: string) {
      const client = agents.get(deviceId);
      return Boolean(client && client.socket.readyState === 1);
    },
  });

  function joinSession(sessionId: string, client: SocketClient) {
    client.sessionId = sessionId;
    let room = sessionRooms.get(sessionId);
    if (!room) {
      room = new Set();
      sessionRooms.set(sessionId, room);
    }
    room.add(client);
  }

  function leave(client: SocketClient) {
    stopStreaming(client);
    // Only remove this socket if it is still the active agent registration.
    // Otherwise a reconnect's old connection closing wipes the new one.
    if (client.deviceId) {
      const current = agents.get(client.deviceId);
      if (current === client) {
        agents.delete(client.deviceId);
        log.info({ deviceId: client.deviceId }, 'agent disconnected');
      }
    }
    if (client.sessionId) {
      const room = sessionRooms.get(client.sessionId);
      room?.delete(client);
      if (room && room.size === 0) sessionRooms.delete(client.sessionId);
    }
  }

  function broadcast(sessionId: string, from: SocketClient, event: string, data: unknown) {
    const room = sessionRooms.get(sessionId);
    if (!room) return;
    const payload = JSON.stringify({ event, data });
    for (const peer of room) {
      if (peer !== from && peer.socket.readyState === 1) {
        peer.socket.send(payload);
      }
    }
  }

  app.get('/ws', { websocket: true }, (socket, request) => {
    let client: SocketClient | null = null;

    socket.send(JSON.stringify({ event: WS_EVENTS.connect, data: { ok: true } }));

    socket.on('message', async (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as { event: string; data?: Record<string, unknown> };
        const event = msg.event;
        const data = msg.data ?? {};

        if (event === WS_EVENTS.ping) {
          socket.send(JSON.stringify({ event: WS_EVENTS.pong, data: { t: Date.now() } }));
          return;
        }

        if (event === WS_EVENTS.auth) {
          const token = String(data.token ?? '');
          const kind = String(data.kind ?? 'user');
          if (kind === 'agent') {
            const claims = verifyAgentToken(token);
            client = {
              socket,
              role: 'agent',
              deviceId: claims.did,
              organizationId: claims.org,
            };
            agents.set(claims.did, client);
            socket.send(
              JSON.stringify({
                event: WS_EVENTS.authOk,
                data: { role: 'agent', deviceId: claims.did },
              }),
            );
            log.info({ deviceId: claims.did }, 'agent connected');
          } else {
            const claims = verifyAccessToken(token);
            client = {
              socket,
              role: 'viewer',
              userId: claims.sub,
              organizationId: claims.org,
            };
            socket.send(
              JSON.stringify({
                event: WS_EVENTS.authOk,
                data: { role: 'viewer', userId: claims.sub },
              }),
            );
          }
          return;
        }

        if (!client) {
          socket.send(
            JSON.stringify({
              event: WS_EVENTS.authError,
              data: { message: 'Authenticate first' },
            }),
          );
          return;
        }

        if (event === WS_EVENTS.agentRegister && client.role === 'agent' && client.deviceId) {
          agents.set(client.deviceId, client);
          socket.send(JSON.stringify({ event: WS_EVENTS.authOk, data: { registered: true } }));
          // Resume any streams requested while this agent was offline.
          for (const [sessionId, entry] of streamSessions) {
            if (entry.deviceId === client.deviceId && entry.viewers.size > 0) {
              for (const viewer of entry.viewers) {
                if (viewer.socket.readyState === 1) {
                  viewer.socket.send(
                    JSON.stringify({
                      event: WS_EVENTS.screenMeta,
                      data: { sessionId, deviceOnline: true },
                    }),
                  );
                }
              }
              socket.send(
                JSON.stringify({
                  event: WS_EVENTS.agentCommand,
                  data: { type: 'start_stream', payload: { sessionId } },
                }),
              );
            }
          }
          return;
        }

        if (event === WS_EVENTS.agentHeartbeat && client.role === 'agent' && client.deviceId) {
          try {
            const devices = new DevicesService(app.prisma);
            await devices.heartbeat(client.deviceId, {
              agentVersion: data.agentVersion as string | undefined,
              metadata: (data.metadata as object | undefined) ?? {},
              ip: request.ip,
            });
          } catch (err) {
            // Keep the agent socket alive even if Supabase is briefly unreachable.
            log.warn({ err, deviceId: client.deviceId }, 'heartbeat db update failed');
          }
          socket.send(JSON.stringify({ event: WS_EVENTS.pong, data: { heartbeat: true } }));
          return;
        }

        if (event === WS_EVENTS.agentCommandResult && client.role === 'agent') {
          log.info({ deviceId: client.deviceId, result: data }, 'agent command result');
          return;
        }

        // Agent → server: a captured screen frame. Fan out to session viewers.
        if (event === WS_EVENTS.screenFrame && client.role === 'agent') {
          const sessionId = String(data.sessionId ?? '');
          const entry = streamSessions.get(sessionId);
          if (entry) {
            const payload = JSON.stringify({ event: WS_EVENTS.screenFrame, data });
            for (const viewer of entry.viewers) {
              if (viewer.socket.readyState === 1) viewer.socket.send(payload);
            }
          }
          return;
        }

        // Agent → server: capture status / errors for active viewers.
        if (event === WS_EVENTS.screenMeta && client.role === 'agent') {
          const sessionId = String(data.sessionId ?? '');
          const entry = streamSessions.get(sessionId);
          if (entry && entry.deviceId === client.deviceId) {
            const payload = JSON.stringify({
              event: WS_EVENTS.screenMeta,
              data: { ...data, deviceOnline: true },
            });
            for (const viewer of entry.viewers) {
              if (viewer.socket.readyState === 1) viewer.socket.send(payload);
            }
          }
          return;
        }

        // Viewer → server: begin watching a device's screen.
        if (event === WS_EVENTS.viewerStart && client.role === 'viewer') {
          const sessionId = String(data.sessionId ?? '');
          const deviceId = String(data.deviceId ?? '');
          if (!sessionId || !deviceId) {
            socket.send(
              JSON.stringify({
                event: WS_EVENTS.error,
                data: { message: 'sessionId and deviceId required' },
              }),
            );
            return;
          }
          let entry = streamSessions.get(sessionId);
          if (!entry) {
            entry = { deviceId, viewers: new Set() };
            streamSessions.set(sessionId, entry);
          }
          entry.viewers.add(client);
          client.sessionId = sessionId;
          const online = app.agentGateway.isOnline(deviceId);
          log.info({ sessionId, deviceId, online }, 'viewer start');
          socket.send(
            JSON.stringify({
              event: WS_EVENTS.screenMeta,
              data: {
                sessionId,
                deviceOnline: online,
                ...(online ? {} : { reason: 'agent_websocket_offline' }),
              },
            }),
          );
          if (online) {
            const sent = app.agentGateway.sendCommand(deviceId, {
              type: 'start_stream',
              payload: { sessionId },
            });
            if (!sent) {
              log.warn({ sessionId, deviceId }, 'start_stream not delivered');
            }
          }
          // If the agent reconnects shortly, agentRegister already resumes streams.
          return;
        }

        if (event === WS_EVENTS.viewerStop && client.role === 'viewer') {
          stopStreaming(client);
          return;
        }

        // Viewer → server → agent: forward a mouse/keyboard input event.
        if (event === WS_EVENTS.inputEvent && client.role === 'viewer') {
          const sessionId = String(data.sessionId ?? client.sessionId ?? '');
          const entry = streamSessions.get(sessionId);
          if (entry) {
            const kind = String(data.kind ?? '');
            if (kind && kind !== 'mouse-move') {
              log.info({ sessionId, deviceId: entry.deviceId, kind }, 'forward input');
            }
            const sent = app.agentGateway.sendCommand(entry.deviceId, {
              type: 'input',
              payload: data,
            });
            if (!sent && kind && kind !== 'mouse-move') {
              log.warn({ sessionId, deviceId: entry.deviceId }, 'input not delivered — agent offline');
            }
          }
          return;
        }

        const sessionId = String(data.sessionId ?? client.sessionId ?? '');
        if (
          event === WS_EVENTS.signalOffer ||
          event === WS_EVENTS.signalAnswer ||
          event === WS_EVENTS.signalIce ||
          event === WS_EVENTS.signalRenegotiate ||
          event === WS_EVENTS.signalHangup
        ) {
          if (!sessionId) {
            socket.send(
              JSON.stringify({
                event: WS_EVENTS.signalError,
                data: { message: 'sessionId required' },
              }),
            );
            return;
          }
          joinSession(sessionId, client);
          broadcast(sessionId, client, event, data);
          return;
        }

        if (event === 'session:join') {
          if (!sessionId) return;
          joinSession(sessionId, client);
          socket.send(
            JSON.stringify({
              event: WS_EVENTS.sessionUpdated,
              data: { sessionId, joined: true },
            }),
          );
        }
      } catch (err) {
        log.warn({ err }, 'socket message error');
        socket.send(
          JSON.stringify({
            event: WS_EVENTS.error,
            data: { message: 'Invalid message' },
          }),
        );
      }
    });

    socket.on('close', () => {
      if (client) leave(client);
    });
  });
}
