import WebSocket from 'ws';
import { WS_EVENTS } from '@nexusdesk/shared';
import { retry } from '@nexusdesk/utils';
import { createLogger } from './logger.js';

const log = createLogger('connection');

export interface AgentConnectionOptions {
  wsUrl: string;
  getToken: () => string;
  maxReconnectDelayMs: number;
  onCommand: (command: unknown) => Promise<void> | void;
}

export class AgentConnection {
  private socket: WebSocket | null = null;
  private intentionallyClosed = false;
  private reconnectAttempt = 0;
  private registered = false;
  private readonly authHandlers: Array<() => void> = [];
  private readonly disconnectHandlers: Array<() => void> = [];

  constructor(private readonly options: AgentConnectionOptions) {}

  onAuthenticated(handler: () => void): void {
    this.authHandlers.push(handler);
  }

  onDisconnected(handler: () => void): void {
    this.disconnectHandlers.push(handler);
  }

  async connect(): Promise<void> {
    this.intentionallyClosed = false;
    await this.open();
  }

  async close(): Promise<void> {
    this.intentionallyClosed = true;
    this.socket?.close();
    this.socket = null;
  }

  sendHeartbeat(payload: Record<string, unknown>): void {
    this.send(WS_EVENTS.agentHeartbeat, payload);
  }

  sendCommandResult(result: unknown): void {
    this.send(WS_EVENTS.agentCommandResult, result as Record<string, unknown>);
  }

  sendFrame(sessionId: string, frame: object): void {
    this.send(WS_EVENTS.screenFrame, { sessionId, ...(frame as Record<string, unknown>) });
  }

  /** Notify viewers (via server fan-out) that capture failed. */
  sendScreenStatus(data: Record<string, unknown>): void {
    this.send(WS_EVENTS.screenMeta, data);
  }

  isOpen(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  private send(event: string, data: Record<string, unknown>): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ event, data }));
  }

  private async open(): Promise<void> {
    // Close any previous socket before opening a new one so the server does not
    // get a stale close that unregisters the newly connected agent.
    const previous = this.socket;
    if (previous) {
      previous.removeAllListeners();
      try {
        previous.close();
      } catch {
        /* ignore */
      }
      this.socket = null;
    }
    this.registered = false;

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.options.wsUrl);
      this.socket = socket;

      socket.on('open', () => {
        this.reconnectAttempt = 0;
        socket.send(
          JSON.stringify({
            event: WS_EVENTS.auth,
            data: { kind: 'agent', token: this.options.getToken() },
          }),
        );
        // agent:register is sent only after authOk (see handleMessage) so it
        // never races ahead of authentication on the server.
        resolve();
      });

      socket.on('message', (raw) => {
        void this.handleMessage(String(raw));
      });

      socket.on('close', () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.registered = false;
        for (const handler of this.disconnectHandlers) handler();
        if (!this.intentionallyClosed) {
          void this.scheduleReconnect();
        }
      });

      socket.on('error', (err) => {
        log.warn({ err }, 'websocket error');
        if (this.socket === socket) {
          reject(err);
        }
      });
    });
  }

  private async handleMessage(raw: string): Promise<void> {
    try {
      const msg = JSON.parse(raw) as { event: string; data?: Record<string, unknown> };
      if (msg.event === WS_EVENTS.authOk) {
        // Register once after the first auth so the server can resume viewers.
        // Ignore the follow-up authOk that agent:register itself returns.
        if (!this.registered && !msg.data?.registered) {
          this.registered = true;
          this.send(WS_EVENTS.agentRegister, {});
        }
        for (const handler of this.authHandlers) handler();
        return;
      }
      if (msg.event === WS_EVENTS.agentCommand) {
        await this.options.onCommand(msg.data);
        return;
      }
      if (msg.event === WS_EVENTS.ping) {
        this.send(WS_EVENTS.pong, { t: Date.now() });
      }
    } catch (err) {
      log.warn({ err }, 'failed to handle message');
    }
  }

  private async scheduleReconnect(): Promise<void> {
    this.reconnectAttempt += 1;
    const delay = Math.min(
      this.options.maxReconnectDelayMs,
      1000 * 2 ** Math.min(this.reconnectAttempt, 6),
    );
    log.info({ delay, attempt: this.reconnectAttempt }, 'reconnecting');
    await new Promise((r) => setTimeout(r, delay));
    try {
      await retry(() => this.open(), { retries: 1, minDelayMs: 250, maxDelayMs: 1000 });
    } catch (err) {
      log.warn({ err }, 'reconnect failed');
      void this.scheduleReconnect();
    }
  }
}
