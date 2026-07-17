import type { FastifyReply, FastifyRequest } from 'fastify';
import { getEnv } from '../config/env.js';
import { AppError } from '../domain/errors/app-error.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit cookie CSRF check for cookie-authenticated browser clients.
 * Bearer-token API clients are exempt.
 */
export async function csrfProtection(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (SAFE_METHODS.has(request.method)) return;

  const auth = request.headers.authorization;
  if (auth?.toLowerCase().startsWith('bearer ')) return;

  const env = getEnv();
  if (env.NODE_ENV === 'test') return;

  const cookieHeader = request.headers.cookie ?? '';
  const match = /(?:^|;\s*)csrf_token=([^;]+)/.exec(cookieHeader);
  const cookieToken = match?.[1];
  const headerToken = request.headers['x-csrf-token'];

  if (!cookieToken || typeof headerToken !== 'string' || cookieToken !== headerToken) {
    throw AppError.forbidden('CSRF token mismatch');
  }
}
