import { createHmac } from 'node:crypto';
import type { TurnCredentials } from '@nexusdesk/types';
import type { RelayEnv } from './env.js';

const USERNAME_SAFE_PATTERN = /^[A-Za-z0-9_.@-]{1,256}$/;

export class InvalidTurnUsernameError extends Error {
  override readonly name = 'InvalidTurnUsernameError';
}

/**
 * Generate time-limited TURN REST API credentials compatible with coturn's
 * `use-auth-secret` mechanism (see coturn.conf.template).
 *
 * Scheme (https://datatracker.ietf.org/doc/html/draft-uberti-behave-turn-rest-00):
 *   username  = "<unix-expiry-timestamp>:<userId>"
 *   password  = base64(HMAC-SHA1(sharedSecret, username))
 */
export function generateTurnCredentials(userId: string, env: RelayEnv): TurnCredentials {
  if (!USERNAME_SAFE_PATTERN.test(userId)) {
    throw new InvalidTurnUsernameError(
      'username must be 1-256 chars of letters, digits, "_.@-"',
    );
  }

  const ttlSeconds = env.TURN_CREDENTIAL_TTL;
  const expiryUnixSeconds = Math.floor(Date.now() / 1000) + ttlSeconds;
  const turnUsername = `${expiryUnixSeconds}:${userId}`;

  const credential = createHmac('sha1', env.TURN_SHARED_SECRET)
    .update(turnUsername)
    .digest('base64');

  return {
    urls: [...env.TURN_URLS, ...env.STUN_URLS],
    username: turnUsername,
    credential,
    ttlSeconds,
    expiresAt: new Date(expiryUnixSeconds * 1000).toISOString(),
  };
}
