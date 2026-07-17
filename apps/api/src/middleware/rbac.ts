import type { FastifyReply, FastifyRequest } from 'fastify';
import { hasPermission } from '@nexusdesk/shared';
import type { PermissionAction, PermissionResource, UserRole } from '@nexusdesk/types';
import { AppError } from '../domain/errors/app-error.js';

export function requirePermission(resource: PermissionResource, action: PermissionAction) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.authUser) {
      throw AppError.unauthorized();
    }
    const role = request.authUser.role as UserRole;
    if (!hasPermission(role, resource, action)) {
      throw AppError.forbidden(`Missing permission ${resource}:${action}`);
    }
  };
}

export function requireRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.authUser) {
      throw AppError.unauthorized();
    }
    if (!roles.includes(request.authUser.role as UserRole)) {
      throw AppError.forbidden('Insufficient role');
    }
  };
}

/** Pure helper for unit tests / services. */
export function checkPermission(
  role: UserRole,
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  return hasPermission(role, resource, action);
}
