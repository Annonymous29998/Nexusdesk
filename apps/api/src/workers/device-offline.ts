import type { FastifyInstance } from 'fastify';
import { DeviceStatus } from '@nexusdesk/types';
import { getEnv } from '../config/env.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('workers');

/**
 * Marks devices offline when heartbeat is stale.
 */
export function startDeviceOfflineWorker(app: FastifyInstance): () => void {
  const env = getEnv();
  const timer = setInterval(async () => {
    try {
      const threshold = new Date(Date.now() - env.AGENT_OFFLINE_THRESHOLD_MS);
      const result = await app.prisma.device.updateMany({
        where: {
          status: DeviceStatus.Online,
          deletedAt: null,
          OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: threshold } }],
        },
        data: { status: DeviceStatus.Offline },
      });
      if (result.count > 0) {
        log.info({ count: result.count }, 'marked stale devices offline');
      }
    } catch (err) {
      log.warn({ err }, 'device offline worker failed');
    }
  }, Math.max(15_000, Math.floor(env.AGENT_OFFLINE_THRESHOLD_MS / 2)));

  return () => clearInterval(timer);
}
