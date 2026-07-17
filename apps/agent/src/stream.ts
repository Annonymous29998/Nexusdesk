import { captureScreenFrame, getLastCaptureError } from './capture/screen.js';
import { createLogger } from './logger.js';

const log = createLogger('stream');

export interface StreamFrame {
  image: string;
  format: 'jpeg';
  width: number;
  height: number;
  t: number;
}

export interface StreamerOptions {
  fps: number;
  quality: number;
  send: (sessionId: string, frame: StreamFrame) => void;
  /** Called when capture fails so the agent can notify viewers. */
  onCaptureError?: (message: string, sessionIds: string[]) => void;
}

/**
 * Captures the screen at a fixed frame rate and pushes JPEG frames (base64)
 * to every active viewer session. A single capture loop fans out to all
 * sessions so multiple viewers share the same capture cost.
 */
export class Streamer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly sessions = new Set<string>();
  private busy = false;
  private warnedNoCapture = false;
  private consecutiveFailures = 0;

  constructor(private readonly opts: StreamerOptions) {}

  start(sessionId: string): void {
    this.sessions.add(sessionId);
    if (this.timer) return;
    const intervalMs = Math.max(50, Math.floor(1000 / Math.max(1, this.opts.fps)));
    log.info({ intervalMs, sessionId }, 'starting screen stream');
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
  }

  stop(sessionId?: string): void {
    if (sessionId) this.sessions.delete(sessionId);
    else this.sessions.clear();
    if (this.sessions.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.consecutiveFailures = 0;
      this.warnedNoCapture = false;
      log.info('stopped screen stream');
    }
  }

  private async tick(): Promise<void> {
    if (this.busy || this.sessions.size === 0) return;
    this.busy = true;
    try {
      const raw = await captureScreenFrame();
      // screenshot-desktop returns a ready-to-send JPEG. If capture is
      // unavailable we get a synthetic RGBA frame that we cannot encode
      // without a native lib, so skip it rather than send a broken image.
      if (raw.format !== 'jpeg') {
        this.consecutiveFailures += 1;
        if (!this.warnedNoCapture || this.consecutiveFailures % 20 === 1) {
          const message = getLastCaptureError() ?? 'screen capture unavailable';
          log.warn({ message, failures: this.consecutiveFailures }, 'no frames sent');
          this.warnedNoCapture = true;
          this.opts.onCaptureError?.(message, [...this.sessions]);
        }
        return;
      }
      this.consecutiveFailures = 0;
      this.warnedNoCapture = false;
      const frame: StreamFrame = {
        image: raw.data.toString('base64'),
        format: 'jpeg',
        width: raw.width,
        height: raw.height,
        t: Date.now(),
      };
      for (const sessionId of this.sessions) this.opts.send(sessionId, frame);
    } catch (err) {
      this.consecutiveFailures += 1;
      log.warn({ err }, 'frame capture failed');
      if (this.consecutiveFailures === 1 || this.consecutiveFailures % 20 === 0) {
        const message = err instanceof Error ? err.message : String(err);
        this.opts.onCaptureError?.(message, [...this.sessions]);
      }
    } finally {
      this.busy = false;
    }
  }
}
