import type { AgentEnv } from './config.js';
import type { AgentAuthStore, AgentTokens } from './auth.js';
import { isJwtExpiringSoon } from './auth.js';
import { createLogger } from './logger.js';

const log = createLogger('refresh');

export interface RefreshedTokens {
  deviceToken: string;
  refreshToken: string;
  wsUrl?: string;
}

/** Renew device credentials before WebSocket auth fails. */
export async function maybeRefreshDeviceToken(
  env: AgentEnv,
  auth: AgentAuthStore,
  tokens: AgentTokens,
): Promise<AgentTokens> {
  if (!isJwtExpiringSoon(tokens.deviceToken, 6 * 60 * 60 * 1000)) {
    return tokens;
  }

  const apiUrl = env.API_URL.replace(/\/$/, '');
  const response = await fetch(`${apiUrl}/devices/token/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });

  if (!response.ok) {
    log.warn({ status: response.status }, 'device token refresh failed');
    return tokens;
  }

  const body = (await response.json()) as RefreshedTokens;
  if (!body.deviceToken || !body.refreshToken) return tokens;

  const next: AgentTokens = {
    deviceToken: body.deviceToken,
    refreshToken: body.refreshToken,
    issuedAt: new Date().toISOString(),
  };
  auth.save(next);
  log.info('device token refreshed');
  return next;
}
