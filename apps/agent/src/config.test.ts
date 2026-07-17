import { describe, expect, it } from 'vitest';
import { shouldReenroll, type AgentRuntimeState } from './config.js';

describe('shouldReenroll', () => {
  const state: AgentRuntimeState = {
    deviceId: 'dev-1',
    organizationId: 'org-1',
    heartbeatIntervalMs: 30_000,
    wsUrl: 'ws://localhost:4000',
    enrolledAt: new Date().toISOString(),
    agentVersion: '0.1.4',
    guestCode: 'ABCDEFGH',
  };

  it('reenrolls when there is no state', () => {
    expect(shouldReenroll(null, false, 'ABCDEFGH')).toBe(true);
  });

  it('reenrolls when tokens are missing', () => {
    expect(shouldReenroll(state, false, 'ABCDEFGH')).toBe(true);
  });

  it('keeps enrollment when guest code matches', () => {
    expect(shouldReenroll(state, true, 'abcdefgh')).toBe(false);
  });

  it('reenrolls when guest code changes', () => {
    expect(shouldReenroll(state, true, 'NEWERCODE')).toBe(true);
  });

  it('does not reenroll when no guest code is provided', () => {
    expect(shouldReenroll(state, true, undefined)).toBe(false);
  });
});
