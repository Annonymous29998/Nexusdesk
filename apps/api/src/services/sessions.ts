import type { PrismaClient } from '@prisma/client';
import type { RemoteConnectionMode } from '@nexusdesk/types';
import { RemoteSessionManager } from '../remote/RemoteSessionManager.js';
import { RemoteConnectionRepository } from '../repositories/index.js';
import { getEnv } from '../config/env.js';

export class SessionsService {
  readonly manager: RemoteSessionManager;
  private readonly connections: RemoteConnectionRepository;

  constructor(prisma: PrismaClient) {
    this.manager = new RemoteSessionManager(prisma);
    this.connections = new RemoteConnectionRepository(prisma);
  }

  create(input: {
    organizationId: string;
    deviceId: string;
    initiatedByUserId: string;
    mode?: RemoteConnectionMode;
    clientIp?: string | null;
    notes?: string | null;
    recordingEnabled?: boolean;
  }) {
    return this.manager.create(input);
  }

  join(input: {
    sessionId: string;
    organizationId: string;
    userId: string;
    mode?: RemoteConnectionMode;
    peerId?: string;
  }) {
    return this.manager.join(input);
  }

  end(organizationId: string, sessionId: string, actorUserId: string, reason?: string) {
    return this.manager.end(organizationId, sessionId, actorUserId, reason);
  }

  get(organizationId: string, sessionId: string) {
    return this.manager.get(organizationId, sessionId);
  }

  list(organizationId: string, page?: number, pageSize?: number) {
    return this.manager.list(organizationId, page, pageSize);
  }

  updateNotes(organizationId: string, sessionId: string, notes: string) {
    return this.manager.updateNotes(organizationId, sessionId, notes);
  }

  listConnections(sessionId: string) {
    return this.connections.listBySession(sessionId);
  }

  async getConnection(organizationId: string, sessionId: string, connectionId: string) {
    const conn = await this.connections.findById(connectionId);
    if (!conn || conn.organizationId !== organizationId || conn.sessionId !== sessionId) {
      return null;
    }
    return conn;
  }

  async markIceConnected(connectionId: string) {
    return this.connections.update(connectionId, {
      iceConnected: true,
      connectedAt: new Date(),
    });
  }

  turnCredentials(organizationId: string, sessionId: string) {
    const env = getEnv();
    return {
      organizationId,
      sessionId,
      iceServers: [
        ...env.STUN_URLS.map((url) => ({ urls: url })),
        ...(env.TURN_URLS.length && env.TURN_USERNAME
          ? [
              {
                urls: env.TURN_URLS,
                username: env.TURN_USERNAME,
                credential: env.TURN_CREDENTIAL,
              },
            ]
          : []),
      ],
      ttl: env.TURN_CREDENTIAL_TTL,
    };
  }
}
