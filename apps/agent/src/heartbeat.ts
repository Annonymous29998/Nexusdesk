import { createLogger } from './logger.js';

const log = createLogger('heartbeat');

export interface HeartbeatServiceOptions {
  intervalMs: number;
  send: (payload: Record<string, unknown>) => void;
  collect: () => Promise<Record<string, unknown>>;
}

export class HeartbeatService {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly options: HeartbeatServiceOptions) {}

  start(): void {
    this.stop();
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.options.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    try {
      const payload = await this.options.collect();
      this.options.send(payload);
    } catch (err) {
      log.warn({ err }, 'heartbeat failed');
    }
  }
}
