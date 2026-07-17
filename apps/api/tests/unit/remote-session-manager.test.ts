import { describe, expect, it, beforeAll, vi } from 'vitest';
import { RemoteConnectionMode, SessionStatus } from '@nexusdesk/types';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ??
    'postgresql://nexusdesk:nexusdesk@localhost:5432/nexusdesk?schema=public';
  process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
  process.env.JWT_ACCESS_SECRET =
    process.env.JWT_ACCESS_SECRET ?? 'test-access-secret-min-32-characters!!';
  process.env.JWT_REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret-min-32-characters!';
  process.env.SESSION_SECRET =
    process.env.SESSION_SECRET ?? 'test-session-secret-min-32-characters!!';
  process.env.ENCRYPTION_KEY =
    process.env.ENCRYPTION_KEY ?? 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
  process.env.AGENT_ENROLLMENT_SECRET =
    process.env.AGENT_ENROLLMENT_SECRET ?? 'test-agent-enrollment-secret!!';
  process.env.INTERNAL_API_TOKEN =
    process.env.INTERNAL_API_TOKEN ?? 'test-internal-api-token-min-32-chars!';
  process.env.FEATURE_RECORDING_ENABLED = 'true';
  process.env.MAX_CONCURRENT_SESSIONS_PER_DEVICE = '5';
});

describe('RemoteSessionManager', () => {
  it('tracks concurrent sessions and duration', async () => {
    const { loadEnv, resetEnvCache } = await import('../../src/config/env.js');
    resetEnvCache();
    loadEnv();

    const { RemoteSessionManager } = await import('../../src/remote/RemoteSessionManager.js');

    const deviceId = 'dev_1';
    const orgId = 'org_1';
    const userId = 'user_1';
    let sessionStatus: string = SessionStatus.Pending;
    let startedAt: Date | null = null;
    let endedAt: Date | null = null;
    let notes: string | null = null;
    let recordingEnabled = false;
    const connections: Array<{ id: string; disconnectedAt: Date | null }> = [];

    const prisma = {
      device: {
        findFirst: vi.fn(async () => ({
          id: deviceId,
          organizationId: orgId,
          name: 'Demo PC',
          status: 'online',
          deletedAt: null,
        })),
      },
      remoteSession: {
        count: vi.fn(async () => 0),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          recordingEnabled = Boolean(data.recordingEnabled);
          notes = (data.notes as string | null) ?? null;
          return {
            id: 'sess_1',
            organizationId: orgId,
            deviceId,
            initiatedByUserId: userId,
            status: SessionStatus.Pending,
            mode: data.mode,
            startedAt: null,
            endedAt: null,
            notes,
            recordingEnabled,
            connections: [],
          };
        }),
        findFirst: vi.fn(async () => ({
          id: 'sess_1',
          organizationId: orgId,
          deviceId,
          initiatedByUserId: userId,
          status: sessionStatus,
          mode: RemoteConnectionMode.Control,
          startedAt,
          endedAt,
          notes,
          recordingEnabled,
          connections,
        })),
        findUnique: vi.fn(async () => ({
          id: 'sess_1',
          organizationId: orgId,
          deviceId,
          initiatedByUserId: userId,
          status: sessionStatus,
          mode: RemoteConnectionMode.Control,
          startedAt,
          endedAt,
          notes,
          recordingEnabled,
          connections,
        })),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          if (data.status) sessionStatus = String(data.status);
          if (data.startedAt) startedAt = data.startedAt as Date;
          if (data.endedAt) endedAt = data.endedAt as Date;
          if (data.notes !== undefined) notes = data.notes as string | null;
          if (data.recordingEnabled !== undefined) {
            recordingEnabled = Boolean(data.recordingEnabled);
          }
          return {
            id: 'sess_1',
            organizationId: orgId,
            deviceId,
            status: sessionStatus,
            startedAt,
            endedAt,
            notes,
            recordingEnabled,
          };
        }),
        findMany: vi.fn(async () => []),
      },
      remoteConnection: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const conn = {
            id: 'conn_1',
            ...data,
            disconnectedAt: null,
            iceConnected: false,
          };
          connections.push(conn as never);
          return conn;
        }),
        findMany: vi.fn(async () => connections),
        update: vi.fn(async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
          const conn = connections.find((c) => c.id === id);
          if (conn && data.disconnectedAt) conn.disconnectedAt = data.disconnectedAt as Date;
          return conn;
        }),
        findUnique: vi.fn(),
      },
      activityLog: {
        create: vi.fn(async (args: unknown) => args),
      },
      auditLog: {
        create: vi.fn(async (args: unknown) => args),
      },
    };

    const manager = new RemoteSessionManager(prisma as never);

    const session = await manager.create({
      organizationId: orgId,
      deviceId,
      initiatedByUserId: userId,
      mode: RemoteConnectionMode.Control,
      notes: 'initial note',
      recordingEnabled: true,
    });

    expect(session.id).toBe('sess_1');
    expect(manager.getConcurrentCount(deviceId)).toBe(1);
    expect(recordingEnabled).toBe(true);

    await manager.join({
      sessionId: session.id,
      organizationId: orgId,
      userId,
      peerId: 'peer_a',
    });
    expect(manager.getLivePeerCount(session.id)).toBe(1);
    expect(sessionStatus).toBe(SessionStatus.Active);
    expect(startedAt).toBeInstanceOf(Date);

    await manager.updateNotes(orgId, session.id, 'updated notes');
    expect(notes).toBe('updated notes');

    const ended = await manager.end(orgId, session.id, userId, 'test_end');
    expect(ended.status).toBe(SessionStatus.Ended);
    expect(manager.getConcurrentCount(deviceId)).toBe(0);

    const duration = manager.durationMs(startedAt, endedAt);
    expect(duration).not.toBeNull();
    expect(duration!).toBeGreaterThanOrEqual(0);
  });
});
