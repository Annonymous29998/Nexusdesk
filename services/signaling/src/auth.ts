import type { AuthTokenClaimsParsed } from '@nexusdesk/shared';
import { authTokenClaimsSchema } from '@nexusdesk/shared';
import jwt from 'jsonwebtoken';
import type { SignalingEnv } from './env.js';

export class SignalingAuthError extends Error {
  override readonly name = 'SignalingAuthError';
  constructor(message: string) {
    super(message);
  }
}

export interface AuthenticatedPeer {
  /** Stable identifier used for routing messages within a room. */
  peerId: string;
  organizationId: string;
  tokenType: AuthTokenClaimsParsed['typ'];
  deviceId?: string;
}

/**
 * Verify a JWT issued by the NexusDesk API using the shared HS256 secret.
 * Both user access tokens and agent device tokens are accepted so that
 * either side of a remote session can authenticate against this service.
 */
export function verifySignalingToken(token: string, env: SignalingEnv): AuthenticatedPeer {
  let decoded: jwt.JwtPayload | string;

  try {
    decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'invalid token';
    throw new SignalingAuthError(`Token verification failed: ${reason}`);
  }

  if (typeof decoded === 'string') {
    throw new SignalingAuthError('Malformed token payload');
  }

  const parsed = authTokenClaimsSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new SignalingAuthError('Token claims failed schema validation');
  }

  const claims = parsed.data;

  if (claims.typ === 'refresh') {
    throw new SignalingAuthError('Refresh tokens cannot be used for signaling');
  }

  return {
    peerId: claims.typ === 'agent' ? claims.did : claims.sub,
    organizationId: claims.org,
    tokenType: claims.typ,
    ...(claims.typ === 'agent' ? { deviceId: claims.did } : {}),
  };
}

/** Extract a bearer token from a `?token=` query param or `Authorization` header. */
export function extractToken(query: Record<string, unknown>, authHeader?: string): string | null {
  const fromHeader = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (fromHeader) return fromHeader;

  const fromQuery = query['token'];
  if (typeof fromQuery === 'string' && fromQuery.length > 0) return fromQuery;

  return null;
}
