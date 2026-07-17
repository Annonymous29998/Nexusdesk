import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { parseDuration, hashSecret, randomToken } from '@nexusdesk/utils';
import type {
  AccessTokenClaims,
  AgentTokenClaims,
  RefreshTokenClaims,
  TokenPair,
  UserRole,
} from '@nexusdesk/types';
import {
  accessTokenClaimsSchema,
  agentTokenClaimsSchema,
  refreshTokenClaimsSchema,
} from '@nexusdesk/shared';
import { getEnv } from '../config/env.js';
import { AppError } from '../domain/errors/app-error.js';
import { ERROR_CODES } from '@nexusdesk/shared';

function signOptions(ttl: string): jwt.SignOptions {
  const env = getEnv();
  return {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    expiresIn: Math.floor(parseDuration(ttl) / 1000),
  };
}

export function createAccessToken(input: {
  userId: string;
  organizationId: string;
  email: string;
  role: UserRole;
  sessionId?: string;
}): { token: string; claims: AccessTokenClaims; expiresAt: Date } {
  const env = getEnv();
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = Math.floor(parseDuration(env.JWT_ACCESS_TTL) / 1000);
  const claims: AccessTokenClaims = {
    sub: input.userId,
    org: input.organizationId,
    email: input.email,
    role: input.role,
    typ: 'access',
    iss: env.JWT_ISSUER,
    aud: env.JWT_AUDIENCE,
    iat: now,
    exp: now + expiresIn,
    jti: randomUUID(),
    ...(input.sessionId ? { sid: input.sessionId } : {}),
  };
  const token = jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
  });
  return { token, claims, expiresAt: new Date((now + expiresIn) * 1000) };
}

export function createRefreshToken(input: {
  userId: string;
  organizationId: string;
  familyId: string;
}): { token: string; claims: RefreshTokenClaims; expiresAt: Date; jti: string } {
  const env = getEnv();
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = Math.floor(parseDuration(env.JWT_REFRESH_TTL) / 1000);
  const jti = randomUUID();
  const claims: RefreshTokenClaims = {
    sub: input.userId,
    org: input.organizationId,
    typ: 'refresh',
    iss: env.JWT_ISSUER,
    aud: env.JWT_AUDIENCE,
    iat: now,
    exp: now + expiresIn,
    jti,
    fam: input.familyId,
  };
  const token = jwt.sign(claims, env.JWT_REFRESH_SECRET, {
    algorithm: 'HS256',
  });
  return { token, claims, expiresAt: new Date((now + expiresIn) * 1000), jti };
}

export function createAgentToken(input: {
  deviceId: string;
  organizationId: string;
  ttl?: string;
}): { token: string; claims: AgentTokenClaims; expiresAt: Date } {
  const env = getEnv();
  const ttl = input.ttl ?? '24h';
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = Math.floor(parseDuration(ttl) / 1000);
  const claims: AgentTokenClaims = {
    sub: input.deviceId,
    org: input.organizationId,
    typ: 'agent',
    iss: env.JWT_ISSUER,
    aud: env.JWT_AUDIENCE,
    iat: now,
    exp: now + expiresIn,
    jti: randomUUID(),
    did: input.deviceId,
  };
  const token = jwt.sign(claims, env.JWT_ACCESS_SECRET, { algorithm: 'HS256' });
  return { token, claims, expiresAt: new Date((now + expiresIn) * 1000) };
}

export function createTokenPair(input: {
  userId: string;
  organizationId: string;
  email: string;
  role: UserRole;
  sessionId?: string;
  familyId?: string;
}): TokenPair & { familyId: string; refreshJti: string; accessJti: string } {
  const familyId = input.familyId ?? randomUUID();
  const access = createAccessToken(input);
  const refresh = createRefreshToken({
    userId: input.userId,
    organizationId: input.organizationId,
    familyId,
  });
  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    accessExpiresAt: access.expiresAt.toISOString(),
    refreshExpiresAt: refresh.expiresAt.toISOString(),
    tokenType: 'Bearer',
    familyId,
    refreshJti: refresh.jti,
    accessJti: access.claims.jti,
  };
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const env = getEnv();
  try {
    const raw = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
    const parsed = accessTokenClaimsSchema.safeParse(raw);
    if (!parsed.success) {
      throw AppError.unauthorized('Invalid access token', ERROR_CODES.TOKEN_INVALID);
    }
    return parsed.data;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Access token expired', ERROR_CODES.TOKEN_EXPIRED);
    }
    throw AppError.unauthorized('Invalid access token', ERROR_CODES.TOKEN_INVALID);
  }
}

export function verifyRefreshToken(token: string): RefreshTokenClaims {
  const env = getEnv();
  try {
    const raw = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
    const parsed = refreshTokenClaimsSchema.safeParse(raw);
    if (!parsed.success) {
      throw AppError.unauthorized('Invalid refresh token', ERROR_CODES.TOKEN_INVALID);
    }
    return parsed.data;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Refresh token expired', ERROR_CODES.TOKEN_EXPIRED);
    }
    throw AppError.unauthorized('Invalid refresh token', ERROR_CODES.TOKEN_INVALID);
  }
}

export function verifyAgentToken(token: string): AgentTokenClaims {
  const env = getEnv();
  try {
    const raw = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });
    const parsed = agentTokenClaimsSchema.safeParse(raw);
    if (!parsed.success) {
      throw AppError.unauthorized('Invalid agent token', ERROR_CODES.TOKEN_INVALID);
    }
    return parsed.data;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw AppError.unauthorized('Agent token expired', ERROR_CODES.TOKEN_EXPIRED);
    }
    throw AppError.unauthorized('Invalid agent token', ERROR_CODES.TOKEN_INVALID);
  }
}

export function hashToken(token: string): string {
  return hashSecret(token);
}

export function generateOpaqueToken(bytes = 32): string {
  return randomToken(bytes);
}

export { signOptions };
