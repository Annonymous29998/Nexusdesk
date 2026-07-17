import { WS_EVENTS } from '@nexusdesk/shared';
import { getAccessToken } from '@/api/client';
import { getWsUrl } from '@/lib/env';

export type StreamStatus =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'waiting'
  | 'streaming'
  | 'offline'
  | 'disconnected'
  | 'error';

export interface ScreenStreamOptions {
  sessionId: string;
  deviceId: string;
  onStatus?: (status: StreamStatus, detail?: string) => void;
  onFrame?: (jpegBase64: string) => void;
}

export interface InputEvent {
  kind: 'mouse-move' | 'mouse-down' | 'mouse-up' | 'wheel' | 'key-down' | 'key-up';
  /** Normalised 0..1 coordinates relative to the streamed image. */
  x?: number;
  y?: number;
  button?: 'left' | 'right' | 'middle';
  deltaY?: number;
  key?: string;
}

/**
 * Live screen stream over the NexusDesk WebSocket. Authenticates as a viewer,
 * asks the server to start the agent capture loop, and emits JPEG frames.
 */
export class ScreenStreamClient {
  private ws: WebSocket | null = null;
  private closed = false;
  private reconnectAttempts = 0;
  private startRetries = 0;
  private startRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastCaptureError: string | null = null;

  constructor(private readonly options: ScreenStreamOptions) {}

  connect(): void {
    this.closed = false;
    this.options.onStatus?.('connecting');
    const token = getAccessToken();
    if (!token) {
      this.options.onStatus?.('error', 'Not authenticated');
      return;
    }

    const url = `${getWsUrl().replace(/\/$/, '')}/ws`;
    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this.options.onStatus?.('error', err instanceof Error ? err.message : 'WebSocket failed');
      return;
    }

    this.ws.onopen = () => {
      this.options.onStatus?.('authenticating');
      this.send({ event: WS_EVENTS.auth, data: { kind: 'user', token } });
    };

    this.ws.onmessage = (event) => {
      let msg: { event?: string; data?: Record<string, unknown> };
      try {
        msg = JSON.parse(String(event.data)) as typeof msg;
      } catch {
        return;
      }

      if (msg.event === WS_EVENTS.authOk) {
        this.reconnectAttempts = 0;
        this.options.onStatus?.('waiting');
        this.requestStream();
        return;
      }

      if (msg.event === WS_EVENTS.screenMeta) {
        const online = Boolean(msg.data?.deviceOnline);
        const captureError =
          typeof msg.data?.captureError === 'string' ? msg.data.captureError : null;
        if (captureError) this.lastCaptureError = captureError;

        if (online) {
          this.startRetries = 0;
          this.options.onStatus?.(
            'waiting',
            captureError ? `capture: ${captureError}` : undefined,
          );
        } else {
          // Agent WS may reconnect a moment later — retry a few times, then show offline.
          this.options.onStatus?.(
            this.startRetries >= 8 ? 'offline' : 'waiting',
            this.startRetries >= 8
              ? 'agent WebSocket offline — is the support app running?'
              : 'waiting for agent…',
          );
          this.scheduleStreamRetry();
        }
        return;
      }

      if (msg.event === WS_EVENTS.screenFrame) {
        const image = msg.data?.image;
        if (typeof image === 'string') {
          this.startRetries = 0;
          this.lastCaptureError = null;
          this.options.onStatus?.('streaming');
          this.options.onFrame?.(image);
        }
        return;
      }

      if (msg.event === WS_EVENTS.authError) {
        this.options.onStatus?.('error', String(msg.data?.message ?? 'Auth failed'));
      }
    };

    this.ws.onerror = () => {
      this.options.onStatus?.('error', 'WebSocket error');
    };

    this.ws.onclose = () => {
      if (this.closed) return;
      this.options.onStatus?.('disconnected');
      if (this.reconnectAttempts < 5) {
        this.reconnectAttempts += 1;
        setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
      }
    };
  }

  private requestStream(): void {
    this.send({
      event: WS_EVENTS.viewerStart,
      data: { sessionId: this.options.sessionId, deviceId: this.options.deviceId },
    });
  }

  private scheduleStreamRetry(): void {
    if (this.closed || this.startRetries >= 40) {
      this.options.onStatus?.(
        'offline',
        this.lastCaptureError
          ? `agent offline · last capture error: ${this.lastCaptureError}`
          : 'agent WebSocket offline',
      );
      return;
    }
    if (this.startRetryTimer) return;
    this.startRetries += 1;
    this.startRetryTimer = setTimeout(() => {
      this.startRetryTimer = null;
      if (this.closed) return;
      this.requestStream();
    }, 1500);
  }

  sendInput(input: InputEvent): void {
    this.send({
      event: WS_EVENTS.inputEvent,
      data: { sessionId: this.options.sessionId, ...input },
    });
  }

  private send(payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  close(options?: { stopStream?: boolean }): void {
    this.closed = true;
    if (this.startRetryTimer) {
      clearTimeout(this.startRetryTimer);
      this.startRetryTimer = null;
    }
    if (options?.stopStream !== false) {
      this.send({ event: WS_EVENTS.viewerStop, data: { sessionId: this.options.sessionId } });
    }
    this.ws?.close();
    this.ws = null;
  }
}
