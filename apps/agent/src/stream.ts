import { captureScreenFrame, getLastCaptureError } from './capture/screen.js';
import { compressFrame } from './capture/encoder.js';
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
  maxWidth: number;
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
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly sessions = new Set<string>();
  private busy = false;
  private warnedNoCapture = false;
  private consecutiveFailures = 0;
  private readonly targetIntervalMs: number;

  constructor(private readonly opts: StreamerOptions) {
    this.targetIntervalMs = Math.max(33, Math.floor(1000 / Math.max(1, opts.fps)));
  }

  start(sessionId: string): void {
    this.sessions.add(sessionId);
    if (this.timer) {
      void this.tick();
      return;
    }
    log.info({ intervalMs: this.targetIntervalMs, sessionId }, 'starting screen stream');
    this.scheduleLoop();
    void this.tick();
  }

  stop(sessionId?: string): void {
    if (sessionId) this.sessions.delete(sessionId);
    else this.sessions.clear();
    if (this.sessions.size === 0 && this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
      this.consecutiveFailures = 0;
      this.warnedNoCapture = false;
      log.info('stopped screen stream');
    }
  }

  private scheduleLoop(): void {
    if (this.sessions.size === 0) return;
    this.timer = setTimeout(() => {
      void this.tick().finally(() => this.scheduleLoop());
    }, this.targetIntervalMs);
  }

  private scaledSize(width: number, height: number): { width: number; height: number } {
    const maxW = this.opts.maxWidth;
    if (width <= maxW) return { width, height };
    const scale = maxW / width;
    return { width: maxW, height: Math.max(1, Math.round(height * scale)) };
  }

  private async tick(): Promise<void> {
    if (this.busy || this.sessions.size === 0) return;
    this.busy = true;
    const started = Date.now();
    try {
      const raw = await captureScreenFrame(this.opts.maxWidth, this.opts.quality);
      if (raw.format !== 'jpeg' && raw.format !== 'rgba' && raw.format !== 'png') {
        this.consecutiveFailures += 1;
        if (!this.warnedNoCapture || this.consecutiveFailures % 20 === 1) {
          const message = getLastCaptureError() ?? 'screen capture unavailable';
          log.warn({ message, failures: this.consecutiveFailures }, 'no frames sent');
          this.warnedNoCapture = true;
          this.opts.onCaptureError?.(message, [...this.sessions]);
        }
        return;
      }
      const jpeg = await compressFrame(raw, this.opts.quality, this.opts.maxWidth);
      if (!jpeg.length) return;

      this.consecutiveFailures = 0;
      this.warnedNoCapture = false;
      const size = this.scaledSize(raw.width, raw.height);
      const frame: StreamFrame = {
        image: jpeg.toString('base64'),
        format: 'jpeg',
        width: size.width,
        height: size.height,
        t: Date.now(),
      };
      for (const sessionId of this.sessions) this.opts.send(sessionId, frame);
    } catch (err) {
      this.consecutiveFailures += 1;
      log.warn({ err, ms: Date.now() - started }, 'frame capture failed');
      if (this.consecutiveFailures === 1 || this.consecutiveFailures % 20 === 0) {
        const message = err instanceof Error ? err.message : String(err);
        this.opts.onCaptureError?.(message, [...this.sessions]);
      }
    } finally {
      this.busy = false;
    }
  }
}
