import type { AgentEnv } from './config.js';
import { AGENT_VERSION } from './config.js';
import { createLogger } from './logger.js';

const log = createLogger('update');

export async function checkForUpdate(env: AgentEnv): Promise<{ updateAvailable: boolean; version?: string }> {
  if (!env.AGENT_UPDATE_URL) {
    log.info('no AGENT_UPDATE_URL configured');
    return { updateAvailable: false };
  }

  try {
    const response = await fetch(env.AGENT_UPDATE_URL, {
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Update check failed: ${response.status}`);
    }
    const manifest = (await response.json()) as { version?: string; url?: string };
    if (!manifest.version || manifest.version === AGENT_VERSION) {
      return { updateAvailable: false, version: AGENT_VERSION };
    }
    log.info({ current: AGENT_VERSION, next: manifest.version, url: manifest.url }, 'update available');
    return { updateAvailable: true, version: manifest.version };
  } catch (err) {
    log.warn({ err }, 'update check failed');
    return { updateAvailable: false };
  }
}
