import type { FastifyReply, FastifyRequest } from 'fastify';
import { ERROR_CODES } from '@nexusdesk/shared';
import type { AccessTokenClaims, AgentTokenClaims } from '@nexusdesk/types';
import { AppError } from '../domain/errors/app-error.js';
import { verifyAccessToken, verifyAgentToken } from '../lib/tokens.js';

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AccessTokenClaims;
    authAgent?: AgentTokenClaims;
  }
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = extractBearer(request.headers.authorization);
  if (!token) {
    throw AppError.unauthorized('Missing bearer token', ERROR_CODES.UNAUTHORIZED);
  }
  request.authUser = verifyAccessToken(token);
}

export async function optionalAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = extractBearer(request.headers.authorization);
  if (!token) return;
  try {
    request.authUser = verifyAccessToken(token);
  } catch {
    // ignore
  }
}

export async function requireAgent(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = extractBearer(request.headers.authorization);
  if (!token) {
    throw AppError.unauthorized('Missing agent token', ERROR_CODES.UNAUTHORIZED);
  }
  request.authAgent = verifyAgentToken(token);
}

export function requireOrgAccess(paramName = 'orgId') {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.authUser) {
      throw AppError.unauthorized();
    }
    const params = request.params as Record<string, string>;
    const orgId = params[paramName];
    if (orgId && orgId !== request.authUser.org) {
      throw AppError.forbidden('Organization access denied');
    }
  };
}
