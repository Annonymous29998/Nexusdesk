import type { PrismaClient } from '@prisma/client';
import { ERROR_CODES } from '@nexusdesk/shared';
import { RemoteConnectionMode, SessionStatus } from '@nexusdesk/types';
import { getEnv } from '../config/env.js';
import { AppError } from '../domain/errors/app-error.js';
import type { RemoteSessionState } from '../domain/entities/index.js';
import {
  DeviceRepository,
  RemoteConnectionRepository,
  RemoteSessionRepository,
} from '../repositories/index.js';
import { AuditService } from '../services/audit.js';

export interface CreateRemoteSessionInput {
  organizationId: string;
  deviceId: string;
  initiatedByUserId: string;
  mode?: RemoteConnectionMode;
  clientIp?: string | null;
  notes?: string | null;
  recordingEnabled?: boolean;
}

export interface JoinRemoteSessionInput {
  sessionId: string;
  organizationId: string;
  userId: string;
  mode?: RemoteConnectionMode;
  peerId?: string;
}

/**
 * In-memory + DB-backed manager for concurrent remote desktop sessions.
 */
export class RemoteSessionManager {
  private readonly sessions: RemoteSessionRepository;
  private readonly connections: RemoteConnectionRepository;
  private readonly devices: DeviceRepository;
  private readonly audit: AuditService;
  /** sessionId → live connection peer count */
  private readonly live = new Map<string, Set<string>>();
  /** deviceId → active session ids */
  private readonly byDevice = new Map<string, Set<string>>();

  constructor(prisma: PrismaClient) {
    this.sessions = new RemoteSessionRepository(prisma);
    this.connections = new RemoteConnectionRepository(prisma);
    this.devices = new DeviceRepository(prisma);
    this.audit = new AuditService(prisma);
  }

  async create(input: CreateRemoteSessionInput) {
    const env = getEnv();
    const device = await this.devices.findInOrg(input.organizationId, input.deviceId);
    if (!device) throw AppError.notFound('Device not found', ERROR_CODES.DEVICE_NOT_FOUND);
    if (device.status === 'disabled') {
      throw AppError.forbidden('Device disabled', ERROR_CODES.DEVICE_DISABLED);
    }
    if (device.status === 'offline') {
      throw AppError.badRequest('Device is offline', ERROR_CODES.DEVICE_OFFLINE);
    }

    const active = await this.sessions.countActiveForDevice(input.deviceId);
    if (active >= env.MAX_CONCURRENT_SESSIONS_PER_DEVICE) {
      throw AppError.badRequest('Session limit reached', ERROR_CODES.SESSION_LIMIT_REACHED);
    }

    const mode = input.mode ?? RemoteConnectionMode.Control;
    const session = await this.sessions.create({
      organizationId: input.organizationId,
      deviceId: input.deviceId,
      initiatedByUserId: input.initiatedByUserId,
      mode,
      clientIp: input.clientIp,
      notes: input.notes,
      recordingEnabled: input.recordingEnabled ?? env.FEATURE_RECORDING_ENABLED,
    });

    this.track(session.id, session.deviceId);

    await this.audit.logActivity({
      organizationId: input.organizationId,
      actorUserId: input.initiatedByUserId,
      action: 'session.create',
      resourceType: 'session',
      resourceId: session.id,
      message: `Remote session created on device ${device.name}`,
    });

    return session;
  }

  async join(input: JoinRemoteSessionInput) {
    const session = await this.sessions.findInOrg(input.organizationId, input.sessionId);
    if (!session) throw AppError.notFound('Session not found', ERROR_CODES.SESSION_NOT_FOUND);

    if (
      session.status === SessionStatus.Ended ||
      session.status === SessionStatus.Failed ||
      session.status === SessionStatus.TimedOut
    ) {
      throw AppError.badRequest('Session is not active', ERROR_CODES.SESSION_NOT_ACTIVE);
    }

    const mode = input.mode ?? session.mode;
    const peerId = input.peerId ?? `peer_${input.userId}_${Date.now()}`;

    const connection = await this.connections.create({
      sessionId: session.id,
      organizationId: session.organizationId,
      deviceId: session.deviceId,
      userId: input.userId,
      mode,
      peerId,
    });

    if (session.status === SessionStatus.Pending || session.status === SessionStatus.Connecting) {
      await this.sessions.update(session.id, {
        status: SessionStatus.Active,
        startedAt: session.startedAt ?? new Date(),
      });
    }

    this.addPeer(session.id, peerId);

    return { session: await this.sessions.findById(session.id), connection };
  }

  async end(
    organizationId: string,
    sessionId: string,
    actorUserId: string,
    reason = 'ended_by_user',
  ) {
    const session = await this.sessions.findInOrg(organizationId, sessionId);
    if (!session) throw AppError.notFound('Session not found', ERROR_CODES.SESSION_NOT_FOUND);

    const endedAt = new Date();
    const updated = await this.sessions.update(sessionId, {
      status: SessionStatus.Ended,
      endedAt,
      endReason: reason,
      // Backfill start time for sessions that never went through join/active.
      ...(session.startedAt ? {} : { startedAt: session.createdAt ?? endedAt }),
    });

    const conns = await this.connections.listBySession(sessionId);
    await Promise.all(
      conns
        .filter((c) => !c.disconnectedAt)
        .map((c) =>
          this.connections.update(c.id, {
            disconnectedAt: endedAt,
            iceConnected: false,
          }),
        ),
    );

    this.untrack(sessionId, session.deviceId);

    await this.audit.logActivity({
      organizationId,
      actorUserId,
      action: 'session.end',
      resourceType: 'session',
      resourceId: sessionId,
      message: `Session ended: ${reason}`,
      metadata: {
        durationMs:
          session.startedAt != null ? endedAt.getTime() - session.startedAt.getTime() : null,
      },
    });

    return updated;
  }

  async updateNotes(organizationId: string, sessionId: string, notes: string) {
    const session = await this.sessions.findInOrg(organizationId, sessionId);
    if (!session) throw AppError.notFound('Session not found', ERROR_CODES.SESSION_NOT_FOUND);
    return this.sessions.update(sessionId, { notes });
  }

  async setRecording(organizationId: string, sessionId: string, enabled: boolean) {
    const session = await this.sessions.findInOrg(organizationId, sessionId);
    if (!session) throw AppError.notFound('Session not found', ERROR_CODES.SESSION_NOT_FOUND);
    return this.sessions.update(sessionId, { recordingEnabled: enabled });
  }

  async get(organizationId: string, sessionId: string): Promise<RemoteSessionState> {
    const session = await this.sessions.findInOrg(organizationId, sessionId);
    if (!session) throw AppError.notFound('Session not found', ERROR_CODES.SESSION_NOT_FOUND);
    return {
      id: session.id,
      organizationId: session.organizationId,
      deviceId: session.deviceId,
      initiatedByUserId: session.initiatedByUserId,
      status: session.status as SessionStatus,
      mode: session.mode as RemoteConnectionMode,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      notes: session.notes,
      recordingEnabled: session.recordingEnabled,
      connectionCount: session.connections.length,
    };
  }

  list(organizationId: string, page?: number, pageSize?: number) {
    return this.sessions.list(organizationId, page, pageSize);
  }

  getConcurrentCount(deviceId: string): number {
    return this.byDevice.get(deviceId)?.size ?? 0;
  }

  getLivePeerCount(sessionId: string): number {
    return this.live.get(sessionId)?.size ?? 0;
  }

  durationMs(startedAt: Date | null, endedAt: Date | null = new Date()): number | null {
    if (!startedAt) return null;
    return (endedAt ?? new Date()).getTime() - startedAt.getTime();
  }

  private track(sessionId: string, deviceId: string) {
    this.live.set(sessionId, new Set());
    const set = this.byDevice.get(deviceId) ?? new Set();
    set.add(sessionId);
    this.byDevice.set(deviceId, set);
  }

  private untrack(sessionId: string, deviceId: string) {
    this.live.delete(sessionId);
    const set = this.byDevice.get(deviceId);
    if (set) {
      set.delete(sessionId);
      if (set.size === 0) this.byDevice.delete(deviceId);
    }
  }

  private addPeer(sessionId: string, peerId: string) {
    const set = this.live.get(sessionId) ?? new Set();
    set.add(peerId);
    this.live.set(sessionId, set);
  }
}
