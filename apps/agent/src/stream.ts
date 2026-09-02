import { captureScreenFrame, getLastCaptureError } from './capture/screen.js';
import { compressFrame } from './capture/encoder.js';
import { onRemoteSessionEnd, onRemoteSessionStart, setStealthInput } from './capture/input.js';
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
  /** Hide guest cursor and skip mouse-move injection while streaming. */
  stealthInput?: boolean;
  send: (sessionId: string, frame: StreamFrame) => void;
  /** Return true when the connection is backed up, so we skip capturing a frame we'd only drop. */
  isBackpressured?: () => boolean;
  /** Called when capture fails so the agent can notify viewers. */
  onCaptureError?: (message: string, sessionIds: string[]) => void;
}

const BURST_DELAYS_MS = [0, 8, 16, 24, 40, 60, 90, 130];

/**
 * Captures the screen at a fixed frame rate and pushes JPEG frames (base64)
 * to every active viewer session. A single capture loop fans out to all
 * sessions so multiple viewers share the same capture cost.
 */
export class Streamer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private moveRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private burstTimers: ReturnType<typeof setTimeout>[] = [];
  private readonly sessions = new Set<string>();
  private busy = false;
  private queuedCaptures = 0;
  private urgentQueued = false;
  private warnedNoCapture = false;
  private consecutiveFailures = 0;
  private readonly targetIntervalMs: number;

  constructor(private readonly opts: StreamerOptions) {
    this.targetIntervalMs = Math.max(16, Math.floor(1000 / Math.max(1, opts.fps)));
  }

  start(sessionId: string): void {
    const wasEmpty = this.sessions.size === 0;
    this.sessions.add(sessionId);
    if (wasEmpty) {
      if (this.opts.stealthInput) {
        setStealthInput(true);
        void onRemoteSessionStart();
      }
      log.info(
        { intervalMs: this.targetIntervalMs, sessionId, stealth: this.opts.stealthInput },
        'starting screen stream',
      );
      this.scheduleLoop();
    }
    this.enqueueCapture();
  }

  stop(sessionId?: string, options?: { keepInputSession?: boolean }): void {
    if (sessionId) this.sessions.delete(sessionId);
    else this.sessions.clear();
    if (this.sessions.size === 0) {
      for (const t of this.burstTimers) clearTimeout(t);
      this.burstTimers = [];
      if (this.moveRefreshTimer) {
        clearTimeout(this.moveRefreshTimer);
        this.moveRefreshTimer = null;
      }
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      this.consecutiveFailures = 0;
      this.warnedNoCapture = false;
      this.queuedCaptures = 0;
      if (!options?.keepInputSession) {
        setStealthInput(false);
        void onRemoteSessionEnd();
      }
      log.info({ keepInputSession: Boolean(options?.keepInputSession) }, 'stopped screen stream');
    }
  }

  /** Push extra frames after remote input so toggles and page changes appear on the dashboard. */
  requestRefresh(kind?: string, buttons?: number): void {
    if (this.sessions.size === 0) return;
    const dragging = kind === 'mouse-move' && (buttons ?? 0) > 0;
    const urgent =
      dragging ||
      kind === 'mouse-down' ||
      kind === 'mouse-up' ||
      kind === 'wheel' ||
      kind === 'key-down' ||
      kind === 'key-up';
    if (urgent) {
      this.scheduleBurst();
      return;
    }
    if (this.moveRefreshTimer) return;
    this.moveRefreshTimer = setTimeout(() => {
      this.moveRefreshTimer = null;
      this.enqueueCapture();
    }, 16);
  }

  private scheduleBurst(): void {
    for (const t of this.burstTimers) clearTimeout(t);
    this.burstTimers = [];
    for (const delay of BURST_DELAYS_MS) {
      const timer = setTimeout(() => {
        this.burstTimers = this.burstTimers.filter((x) => x !== timer);
        this.enqueueCapture(true);
      }, delay);
      this.burstTimers.push(timer);
    }
  }

  private enqueueCapture(urgent = false): void {
    if (this.sessions.size === 0) return;
    if (urgent) this.urgentQueued = true;
    this.queuedCaptures = Math.min(this.queuedCaptures + 1, urgent ? 6 : 3);
    this.drainQueue();
  }

  private drainQueue(): void {
    if (this.busy || this.queuedCaptures <= 0 || this.sessions.size === 0) return;
    const urgent = this.urgentQueued;
    this.urgentQueued = false;
    this.queuedCaptures -= 1;
    void this.tick(urgent).finally(() => {
      if (this.queuedCaptures > 0) {
        setTimeout(() => this.drainQueue(), urgent ? 8 : 16);
      }
    });
  }

  private scheduleLoop(): void {
    if (this.sessions.size === 0) return;
    this.timer = setTimeout(() => {
      this.enqueueCapture();
      this.scheduleLoop();
    }, this.targetIntervalMs);
  }

  private scaledSize(width: number, height: number): { width: number; height: number } {
    const maxW = this.opts.maxWidth;
    if (width <= maxW) return { width, height };
    const scale = maxW / width;
    return { width: maxW, height: Math.max(1, Math.round(height * scale)) };
  }

  private async tick(urgent = false): Promise<void> {
    if (this.busy || this.sessions.size === 0) return;
    // Skip capture while backed up unless this frame was triggered by user input.
    if (!urgent && this.opts.isBackpressured?.()) return;
    this.busy = true;
    const started = Date.now();
    try {
      const raw = await captureScreenFrame(this.opts.maxWidth, this.opts.quality);
      const captureFailed = raw.format === 'rgba' && raw.data.length <= 4;
      if (
        captureFailed ||
        (raw.format !== 'jpeg' && raw.format !== 'rgba' && raw.format !== 'png')
      ) {
        this.consecutiveFailures += 1;
        if (!this.warnedNoCapture || this.consecutiveFailures % 20 === 1) {
          const message = getLastCaptureError() ?? 'screen capture unavailable';
          log.warn({ message, failures: this.consecutiveFailures }, 'no frames sent');
          this.warnedNoCapture = true;
          this.opts.onCaptureError?.(message, [...this.sessions]);
        }
        return;
      }
      if (raw.format !== 'jpeg') {
        const jpeg = await compressFrame(raw, this.opts.quality, this.opts.maxWidth);
        if (!jpeg.length || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return;
        await this.sendJpeg(raw, jpeg, started);
        return;
      }
      const jpeg =
        raw.width <= this.opts.maxWidth
          ? raw.data
          : await compressFrame(raw, this.opts.quality, this.opts.maxWidth);
      if (!jpeg.length || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return;

      await this.sendJpeg(raw, jpeg, started);
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

  private async sendJpeg(
    raw: { width: number; height: number },
    jpeg: Buffer,
    started: number,
  ): Promise<void> {
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
    const ms = Date.now() - started;
    if (ms > 400) log.debug({ ms }, 'slow frame capture');
  }
}
