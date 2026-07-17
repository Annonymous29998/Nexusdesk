import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { API_ROUTES } from '@nexusdesk/shared';
import { PermissionAction, PermissionResource } from '@nexusdesk/types';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuditService } from '../services/audit.js';

export async function registerAuditRoutes(app: FastifyInstance): Promise<void> {
  const audit = () => new AuditService(app.prisma);

  app.get(
    API_ROUTES.audit.root,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.AuditLog, PermissionAction.Read)] },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      const q = z.object({
        page: z.coerce.number().int().positive().optional(),
        pageSize: z.coerce.number().int().positive().max(100).optional(),
      }).parse(req.query);
      return audit().list(orgId, q.page, q.pageSize);
    },
  );

  app.get(
    API_ROUTES.activity.root,
    { preHandler: [requireAuth, requireOrgAccess()] },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      const q = z.object({
        page: z.coerce.number().int().positive().optional(),
        pageSize: z.coerce.number().int().positive().max(100).optional(),
      }).parse(req.query);
      return audit().listActivity(orgId, q.page, q.pageSize);
    },
  );
}
