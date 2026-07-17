import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { API_ROUTES } from '@nexusdesk/shared';
import { PermissionAction, PermissionResource } from '@nexusdesk/types';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { OrganizationsService, AnalyticsService } from '../services/index.js';

export async function registerOrgRoutes(app: FastifyInstance): Promise<void> {
  const orgs = () => new OrganizationsService(app.prisma);
  const analytics = () => new AnalyticsService(app.prisma);

  app.get(
    API_ROUTES.organizations.root,
    { preHandler: [requireAuth] },
    async (req) => {
      return orgs().listForUser(req.authUser!.sub);
    },
  );

  app.get(
    API_ROUTES.organizations.byId,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.Organization, PermissionAction.Read)] },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      return orgs().get(orgId);
    },
  );

  app.patch(
    API_ROUTES.organizations.byId,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.Organization, PermissionAction.Update)] },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      const body = z.object({
        name: z.string().min(1).max(120).optional(),
        logoUrl: z.string().url().nullable().optional(),
        settings: z.record(z.unknown()).optional(),
      }).parse(req.body);
      return orgs().update(orgId, req.authUser!.sub, body);
    },
  );

  app.get(
    API_ROUTES.organizations.settings,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.Settings, PermissionAction.Read)] },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      return orgs().get(orgId);
    },
  );

  app.get(
    '/organizations/:orgId/analytics',
    { preHandler: [requireAuth, requireOrgAccess()] },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      return analytics().summary(orgId);
    },
  );

  app.get(
    '/organizations/:orgId/analytics/summary',
    { preHandler: [requireAuth, requireOrgAccess()] },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      return analytics().summary(orgId);
    },
  );

  app.get(
    '/organizations/:orgId/analytics/overview',
    { preHandler: [requireAuth, requireOrgAccess()] },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      return analytics().summary(orgId);
    },
  );

  app.get(
    '/organizations/:orgId/members',
    { preHandler: [requireAuth, requireOrgAccess()] },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      return orgs().listMembers(orgId);
    },
  );
}
