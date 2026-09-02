import { WS_EVENTS } from '@nexusdesk/shared';
import { getAccessToken } from '@/api/client';
import { getWsEndpoint } from '@/lib/env';

export type StreamStatus =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'waiting'
  | 'streaming'
  | 'offline'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export interface ScreenStreamOptions {
  sessionId: string;
  deviceId: string;
  onStatus?: (status: StreamStatus, detail?: string) => void;
  onFrame?: (jpegBase64: string) => void;
  onClipboard?: (text: string) => void;
  onSignal?: (event: string, data: Record<string, unknown>) => void;
}

export interface InputEvent {
  kind:
    | 'mouse-move'
    | 'mouse-down'
    | 'mouse-up'
    | 'wheel'
    | 'key-down'
    | 'key-up'
    | 'clipboard-paste'
    | 'clipboard-pull';
  /** Normalised 0..1 coordinates relative to the streamed image. */
  x?: number;
  y?: number;
  button?: 'left' | 'right' | 'middle';
  /** Pointer buttons bitmask (1=left, 2=right, 4=middle) while held during drag. */
  buttons?: number;
  deltaY?: number;
  key?: string;
  code?: string;
  text?: string;
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
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastCaptureError: string | null = null;
  private streaming = false;

  constructor(private readonly options: ScreenStreamOptions) {}

  connect(): void {
    this.closed = false;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.options.onStatus?.('connecting');
    const token = getAccessToken();
    if (!token) {
      this.options.onStatus?.('error', 'Not authenticated');
      return;
    }

    const url = getWsEndpoint();
    try {
      this.ws = new WebSocket(url);
    } catch (err) {
      this.options.onStatus?.('error', err instanceof Error ? err.message : 'WebSocket failed');
      return;
    }

    this.ws.onopen = () => {
      this.options.onStatus?.('authenticating');
      this.send({ event: WS_EVENTS.auth, data: { kind: 'user', token } });
      this.startPing();
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
          this.options.onStatus?.(
            this.startRetries >= 12 ? 'offline' : 'reconnecting',
            this.startRetries >= 12
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
          if (!this.streaming) {
            this.streaming = true;
            this.options.onStatus?.('streaming');
          }
          this.options.onFrame?.(image);
        }
        return;
      }

      if (msg.event === WS_EVENTS.clipboardSync) {
        const text = msg.data?.text;
        if (typeof text === 'string') {
          this.options.onClipboard?.(text);
        }
        return;
      }

      if (
        msg.event === WS_EVENTS.signalOffer ||
        msg.event === WS_EVENTS.signalAnswer ||
        msg.event === WS_EVENTS.signalIce
      ) {
        this.options.onSignal?.(msg.event, msg.data ?? {});
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
      this.stopPing();
      if (this.closed) return;
      this.options.onStatus?.('reconnecting', 'restoring connection…');
      if (this.reconnectAttempts < 8) {
        this.reconnectAttempts += 1;
        setTimeout(() => this.connect(), 1000 * Math.min(this.reconnectAttempts, 4));
      } else {
        this.options.onStatus?.('disconnected', 'connection lost');
      }
    };
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      this.send({ event: WS_EVENTS.ping, data: { t: Date.now() } });
    }, 25_000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private requestStream(): void {
    this.send({
      event: WS_EVENTS.viewerStart,
      data: { sessionId: this.options.sessionId, deviceId: this.options.deviceId },
    });
  }

  private scheduleStreamRetry(): void {
    if (this.closed || this.startRetries >= 12) {
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

  /** Ask the remote agent to return its OS clipboard (after Ctrl+C on guest). */
  requestRemoteClipboard(): void {
    this.sendInput({ kind: 'clipboard-pull' });
  }

  /** Paste local text into the remote session. */
  pasteToRemote(text: string): void {
    this.sendInput({ kind: 'clipboard-paste', text });
  }

  sendSignal(event: string, data: Record<string, unknown>): void {
    this.send({ event, data: { sessionId: this.options.sessionId, ...data } });
  }

  private send(payload: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  close(options?: { stopStream?: boolean }): void {
    this.closed = true;
    this.stopPing();
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
