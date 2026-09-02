import { describe, expect, it, beforeEach } from 'vitest';

function loadEnv() {
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
}

describe('buildIceServers', () => {
  beforeEach(async () => {
    loadEnv();
    const { resetEnvCache, loadEnv: parse } = await import('../../src/config/env.js');
    resetEnvCache();
    parse({
      ...process.env,
      STUN_URLS: 'stun:stun.l.google.com:19302',
      TURN_URLS: 'turn:turn.example.com:3478',
      TURN_SHARED_SECRET: 'unit-test-turn-shared-secret-min-16',
      TURN_USERNAME: '',
      TURN_CREDENTIAL: '',
      TURN_CREDENTIAL_TTL: '3600',
    });
  });

  it('includes STUN and time-limited TURN credentials', async () => {
    const { buildIceServers } = await import('../../src/lib/ice-servers.js');
    const now = Date.parse('2026-09-02T12:00:00.000Z');
    const result = buildIceServers('agent:dev-1:sess:abc', now);
    expect(result.iceServers[0]).toEqual({ urls: 'stun:stun.l.google.com:19302' });
    const turn = result.iceServers[1];
    expect(turn?.urls).toEqual(['turn:turn.example.com:3478']);
    expect(String(turn?.username)).toMatch(/^\d+:agent_dev-1_sess_abc$/);
    expect(turn?.credential).toBeTruthy();
    expect(result.ttl).toBe(3600);
  });

  it('does not embed the shared secret in the payload', async () => {
    const { buildIceServers } = await import('../../src/lib/ice-servers.js');
    const result = buildIceServers('viewer-user-1');
    const blob = JSON.stringify(result);
    expect(blob).not.toContain('unit-test-turn-shared-secret-min-16');
  });
});
