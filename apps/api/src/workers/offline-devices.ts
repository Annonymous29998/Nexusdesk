import type { FastifyInstance } from 'fastify';
import { DeviceStatus } from '@nexusdesk/types';
import { getEnv } from '../config/env.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('offline-worker');

export function startOfflineDeviceWorker(app: FastifyInstance): void {
  const env = getEnv();
  const interval = Math.max(15_000, Math.floor(env.AGENT_HEARTBEAT_INTERVAL_MS));

  const timer = setInterval(async () => {
    try {
      const threshold = new Date(Date.now() - env.AGENT_OFFLINE_THRESHOLD_MS);
      const result = await app.prisma.device.updateMany({
        where: {
          status: { in: [DeviceStatus.Online, DeviceStatus.Updating] },
          deletedAt: null,
          OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: threshold } }],
        },
        data: { status: DeviceStatus.Offline },
      });
      if (result.count > 0) {
        log.info({ count: result.count }, 'marked devices offline');
      }
    } catch (err) {
      log.warn({ err }, 'offline device sweep failed');
    }
  }, interval);

  app.addHook('onClose', async () => {
    clearInterval(timer);
  });
}
