import { createHmac } from 'node:crypto';
import { getEnv } from '../config/env.js';

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceServersPayload {
  iceServers: IceServerConfig[];
  ttl: number;
  expiresAt: string;
}

function sanitizeTurnIdentity(identity: string): string {
  const cleaned = identity.replace(/[^A-Za-z0-9_.@-]/g, '_').replace(/_+/g, '_');
  return cleaned.slice(0, 80) || 'peer';
}

/**
 * ICE servers for a viewer or agent. STUN is always included.
 * TURN uses time-limited coturn REST credentials when TURN_SHARED_SECRET is set,
 * otherwise static TURN_USERNAME / TURN_CREDENTIAL if configured.
 * Never log the credential field.
 */
export function buildIceServers(identity: string, nowMs = Date.now()): IceServersPayload {
  const env = getEnv();
  const iceServers: IceServerConfig[] = env.STUN_URLS.filter(Boolean).map((url) => ({ urls: url }));
  const ttl = env.TURN_CREDENTIAL_TTL;
  const expiresAt = new Date(nowMs + ttl * 1000).toISOString();

  if (!env.TURN_URLS.length) {
    return { iceServers, ttl, expiresAt };
  }

  if (env.TURN_SHARED_SECRET) {
    const expiryUnixSeconds = Math.floor(nowMs / 1000) + ttl;
    const username = `${expiryUnixSeconds}:${sanitizeTurnIdentity(identity)}`;
    const credential = createHmac('sha1', env.TURN_SHARED_SECRET).update(username).digest('base64');
    iceServers.push({
      urls: env.TURN_URLS,
      username,
      credential,
    });
    return { iceServers, ttl, expiresAt };
  }

  if (env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    iceServers.push({
      urls: env.TURN_URLS,
      username: env.TURN_USERNAME,
      credential: env.TURN_CREDENTIAL,
    });
  }

  return { iceServers, ttl, expiresAt };
}
