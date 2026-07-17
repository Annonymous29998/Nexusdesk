import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { API_ROUTES } from '@nexusdesk/shared';
import { PermissionAction, PermissionResource, UserRole } from '@nexusdesk/types';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { UsersService } from '../services/users.js';

export async function registerUserRoutes(app: FastifyInstance): Promise<void> {
  const users = () => new UsersService(app.prisma);

  app.get(
    API_ROUTES.users.root,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.User, PermissionAction.Read)] },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      const q = z.object({
        page: z.coerce.number().int().positive().optional(),
        pageSize: z.coerce.number().int().positive().max(100).optional(),
      }).parse(req.query);
      return users().list(orgId, q.page, q.pageSize);
    },
  );

  app.get(
    API_ROUTES.users.byId,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.User, PermissionAction.Read)] },
    async (req) => {
      const { orgId, userId } = req.params as { orgId: string; userId: string };
      return users().get(orgId, userId);
    },
  );

  app.patch(
    API_ROUTES.users.byId,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.User, PermissionAction.Update)] },
    async (req) => {
      const { orgId, userId } = req.params as { orgId: string; userId: string };
      const body = z.object({
        displayName: z.string().min(1).max(120).optional(),
        role: z.nativeEnum(UserRole).optional(),
        isActive: z.boolean().optional(),
      }).parse(req.body);
      return users().update(orgId, userId, req.authUser!.sub, body);
    },
  );

  app.delete(
    API_ROUTES.users.byId,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.User, PermissionAction.Delete)] },
    async (req) => {
      const { orgId, userId } = req.params as { orgId: string; userId: string };
      return users().remove(orgId, userId, req.authUser!.sub);
    },
  );
}
