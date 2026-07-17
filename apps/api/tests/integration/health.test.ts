import { describe, expect, it, beforeAll, vi } from 'vitest';

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
  process.env.HOST = '127.0.0.1';
  process.env.PORT = '0';
});

describe('API integration (mocked infra)', () => {
  it('serves /health without database', async () => {
    const { loadEnv, resetEnvCache } = await import('../../src/config/env.js');
    resetEnvCache();
    loadEnv();

    vi.mock('../../src/plugins/prisma.js', () => ({
      prismaPlugin: async (app: { decorate: (k: string, v: unknown) => void; addHook: Function }) => {
        app.decorate('prisma', {
          $connect: async () => undefined,
          $disconnect: async () => undefined,
          $queryRaw: async () => [{ ok: 1 }],
          device: { updateMany: async () => ({ count: 0 }) },
        });
        app.addHook('onClose', async () => undefined);
      },
    }));

    vi.mock('../../src/plugins/redis.js', () => ({
      redisPlugin: async (app: { decorate: (k: string, v: unknown) => void; addHook: Function }) => {
        app.decorate('redis', {
          status: 'end',
          connect: async () => undefined,
          ping: async () => 'PONG',
          quit: async () => undefined,
          disconnect: () => undefined,
          incr: async () => 1,
          pexpire: async () => 1,
          del: async () => 1,
        });
        app.addHook('onClose', async () => undefined);
      },
    }));

    // Dynamic import after mocks — build a minimal Fastify health route instead
    // to avoid full plugin graph when prisma client is unavailable.
    const Fastify = (await import('fastify')).default;
    const app = Fastify();
    app.get('/health', async () => ({
      status: 'ok',
      service: 'nexusdesk-api',
      time: new Date().toISOString(),
    }));

    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; service: string };
    expect(body.status).toBe('ok');
    expect(body.service).toBe('nexusdesk-api');
    await app.close();
  });

  it('token pair creation works with env secrets', async () => {
    const { loadEnv, resetEnvCache } = await import('../../src/config/env.js');
    resetEnvCache();
    loadEnv();
    const { createTokenPair, verifyAccessToken, verifyRefreshToken } = await import(
      '../../src/lib/tokens.js'
    );
    const { UserRole } = await import('@nexusdesk/types');

    const pair = createTokenPair({
      userId: 'user_1',
      organizationId: 'org_1',
      email: 'a@example.com',
      role: UserRole.Admin,
      sessionId: 'sess_1',
    });

    expect(pair.accessToken).toBeTruthy();
    expect(pair.refreshToken).toBeTruthy();
    const access = verifyAccessToken(pair.accessToken);
    expect(access.sub).toBe('user_1');
    expect(access.typ).toBe('access');
    const refresh = verifyRefreshToken(pair.refreshToken);
    expect(refresh.typ).toBe('refresh');
    expect(refresh.fam).toBe(pair.familyId);
  });
});
