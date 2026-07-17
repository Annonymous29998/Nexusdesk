import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { API_ROUTES } from '@nexusdesk/shared';
import { PermissionAction, PermissionResource } from '@nexusdesk/types';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { ApiKeysService } from '../services/invitations.js';

export async function registerApiKeyRoutes(app: FastifyInstance): Promise<void> {
  const keys = () => new ApiKeysService(app.prisma);

  app.get(
    API_ROUTES.apiKeys.root,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.ApiKey, PermissionAction.Read)] },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      return keys().list(orgId);
    },
  );

  app.post(
    API_ROUTES.apiKeys.root,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.ApiKey, PermissionAction.Create)] },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      const body = z.object({
        name: z.string().min(1).max(120),
        scopes: z.array(z.string()).default([]),
        expiresAt: z.string().datetime().optional(),
      }).parse(req.body);
      return keys().create(orgId, req.authUser!.sub, {
        name: body.name,
        scopes: body.scopes,
        expiresAt: body.expiresAt ?? null,
      });
    },
  );

  app.delete(
    API_ROUTES.apiKeys.byId,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.ApiKey, PermissionAction.Delete)] },
    async (req) => {
      const { orgId, keyId } = req.params as { orgId: string; keyId: string };
      return keys().revoke(orgId, keyId, req.authUser!.sub);
    },
  );
}
