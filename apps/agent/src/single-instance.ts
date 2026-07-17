import { createServer, type Server } from 'node:net';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from './logger.js';

const log = createLogger('single-instance');

let lockServer: Server | null = null;

/**
 * Ensure only one agent process runs per machine. Duplicate processes
 * fight over the same device WebSocket and break remote viewing.
 */
export function acquireSingleInstance(): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    const endpoint =
      process.platform === 'win32'
        ? '\\\\.\\pipe\\NexusDeskAgentLock'
        : join(tmpdir(), 'nexusdesk-agent.lock.sock');

    if (process.platform !== 'win32') {
      try {
        unlinkSync(endpoint);
      } catch {
        /* ignore */
      }
    }

    server.once('error', (err) => {
      log.warn({ err }, 'another agent instance is already running');
      resolve(false);
    });

    server.listen(endpoint, () => {
      lockServer = server;
      log.info('single-instance lock acquired');
      resolve(true);
    });
  });
}

export async function releaseSingleInstance(): Promise<void> {
  if (!lockServer) return;
  await new Promise<void>((resolve) => {
    lockServer?.close(() => resolve());
  });
  lockServer = null;
}
