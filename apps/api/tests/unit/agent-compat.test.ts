import { describe, expect, it } from 'vitest';
import {
  compareAgentVersion,
  isRemoteControlAgentCompatible,
  MIN_REMOTE_CONTROL_AGENT_VERSION,
} from '@nexusdesk/shared';

describe('agent compatibility', () => {
  it('treats missing versions as incompatible', () => {
    expect(isRemoteControlAgentCompatible(undefined)).toBe(false);
    expect(isRemoteControlAgentCompatible('')).toBe(false);
  });

  it('rejects agents older than the minimum remote-control version', () => {
    expect(compareAgentVersion('0.1.24', MIN_REMOTE_CONTROL_AGENT_VERSION)).toBeLessThan(0);
    expect(isRemoteControlAgentCompatible('0.1.24')).toBe(false);
  });

  it('accepts the current minimum and newer', () => {
    expect(isRemoteControlAgentCompatible('0.1.25')).toBe(true);
    expect(isRemoteControlAgentCompatible('0.2.0')).toBe(true);
  });
});
