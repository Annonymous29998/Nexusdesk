import { describe, expect, it, vi } from 'vitest';
import { HeartbeatService } from './heartbeat.js';

describe('HeartbeatService', () => {
  it('sends heartbeats on an interval and stops cleanly', async () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const collect = vi.fn(async () => ({ agentVersion: '0.1.0' }));

    const service = new HeartbeatService({
      intervalMs: 1000,
      send,
      collect,
    });

    service.start();
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(2);

    service.stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('swallows collector failures without throwing', async () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const collect = vi.fn(async () => {
      throw new Error('sensor unavailable');
    });

    const service = new HeartbeatService({
      intervalMs: 500,
      send,
      collect,
    });

    service.start();
    await Promise.resolve();
    expect(send).not.toHaveBeenCalled();
    service.stop();
    vi.useRealTimers();
  });
});
