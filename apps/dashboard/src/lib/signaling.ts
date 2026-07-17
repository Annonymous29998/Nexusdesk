import { WS_EVENTS } from '@nexusdesk/shared';
import type { SignalingMessage } from '@nexusdesk/types';
import { getAccessToken } from '@/api/client';
import { getWsUrl } from '@/lib/env';

export type SignalingStatus =
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface SignalingClientOptions {
  sessionId: string;
  connectionId: string;
  peerId: string;
  onStatus?: (status: SignalingStatus, detail?: string) => void;
  onMessage?: (message: SignalingMessage | Record<string, unknown>) => void;
}

/**
 * WebRTC signaling client stub — connects to the NexusDesk WS endpoint,
 * authenticates, and joins the session room. Full SDP/ICE exchange can be
 * layered on top when media peers are available.
 */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private readonly options: SignalingClientOptions;
  private reconnectAttempts = 0;
  private closed = false;

  constructor(options: SignalingClientOptions) {
    this.options = options;
  }

  connect() {
    this.closed = false;
    this.options.onStatus?.('connecting');
    const token = getAccessToken() ?? 'demo';
    const url = `${getWsUrl()}?token=${encodeURIComponent(token)}&sessionId=${encodeURIComponent(this.options.sessionId)}`;

    try {
      this.ws = new WebSocket(url);
    } catch (error) {
      this.options.onStatus?.(
        'error',
        error instanceof Error ? error.message : 'Failed to open WebSocket',
      );
      this.simulateDemoChannel();
      return;
    }

    this.ws.onopen = () => {
      this.options.onStatus?.('authenticating');
      this.send({
        event: WS_EVENTS.auth,
        payload: {
          accessToken: token,
          peerId: this.options.peerId,
          sessionId: this.options.sessionId,
          connectionId: this.options.connectionId,
        },
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data)) as Record<string, unknown>;
        if (data.event === WS_EVENTS.authOk || data.type === 'auth:ok') {
          this.reconnectAttempts = 0;
          this.options.onStatus?.('connected');
          this.send({
            event: WS_EVENTS.connect,
            payload: {
              sessionId: this.options.sessionId,
              connectionId: this.options.connectionId,
              peerId: this.options.peerId,
            },
          });
        }
        this.options.onMessage?.(data as SignalingMessage | Record<string, unknown>);
      } catch {
        this.options.onMessage?.({ raw: String(event.data) });
      }
    };

    this.ws.onerror = () => {
      this.options.onStatus?.('error', 'WebSocket error');
    };

    this.ws.onclose = () => {
      this.options.onStatus?.('disconnected');
      if (!this.closed && this.reconnectAttempts < 3) {
        this.reconnectAttempts += 1;
        setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
      } else if (!this.closed) {
        this.simulateDemoChannel();
      }
    };
  }

  /** When signaling server is unreachable, keep the viewer UI interactive. */
  private simulateDemoChannel() {
    this.options.onStatus?.('connected', 'demo-local');
    this.options.onMessage?.({
      event: WS_EVENTS.authOk,
      payload: { demo: true, sessionId: this.options.sessionId },
    });
  }

  send(payload: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  hangup(reason = 'user_hangup') {
    this.send({
      event: WS_EVENTS.signalHangup,
      payload: {
        sessionId: this.options.sessionId,
        connectionId: this.options.connectionId,
        fromPeerId: this.options.peerId,
        reason,
      },
    });
    this.close();
  }

  close() {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }
}
