import { describe, expect, it } from 'vitest';
import {
  iceRestartDelayMs,
  isDiscreteInput,
  isWebrtcHealthy,
  selectInputTransport,
  shouldStartJpegFallback,
  shouldStopJpeg,
} from './stream-mode.js';

describe('stream-mode', () => {
  it('starts JPEG immediately when WebRTC never started', () => {
    expect(
      shouldStartJpegFallback({ webrtcStarted: false, webrtcHealthy: false, elapsedMs: 0 }),
    ).toBe(true);
  });

  it('waits before JPEG while WebRTC is negotiating', () => {
    expect(
      shouldStartJpegFallback({ webrtcStarted: true, webrtcHealthy: false, elapsedMs: 500 }),
    ).toBe(false);
    expect(
      shouldStartJpegFallback({ webrtcStarted: true, webrtcHealthy: false, elapsedMs: 4_000 }),
    ).toBe(true);
  });

  it('never starts JPEG when WebRTC is healthy', () => {
    expect(
      shouldStartJpegFallback({ webrtcStarted: true, webrtcHealthy: true, elapsedMs: 30_000 }),
    ).toBe(false);
    expect(shouldStopJpeg(true)).toBe(true);
  });

  it('requires connected ICE plus at least one pushed frame', () => {
    expect(isWebrtcHealthy({ connectionState: 'connected', framesPushed: 0 })).toBe(false);
    expect(isWebrtcHealthy({ connectionState: 'checking', framesPushed: 12 })).toBe(false);
    expect(isWebrtcHealthy({ connectionState: 'connected', framesPushed: 1 })).toBe(true);
    expect(isWebrtcHealthy({ connectionState: 'completed', framesPushed: 2 })).toBe(true);
  });

  it('uses exponential ICE restart backoff with a cap', () => {
    expect(iceRestartDelayMs(1)).toBe(400);
    expect(iceRestartDelayMs(2)).toBe(800);
    expect(iceRestartDelayMs(8)).toBe(8_000);
  });

  it('sends discrete input on the reliable channel, not the move channel', () => {
    expect(selectInputTransport('mouse-move', true, true)).toBe('move');
    expect(selectInputTransport('mouse-down', true, true)).toBe('input');
    expect(selectInputTransport('key-down', true, true)).toBe('input');
    expect(selectInputTransport('wheel', false, true)).toBe('input');
    expect(selectInputTransport('mouse-move', false, false)).toBe('websocket');
    expect(isDiscreteInput('mouse-down')).toBe(true);
    expect(isDiscreteInput('mouse-move')).toBe(false);
  });
});
