import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { API_ROUTES } from '@nexusdesk/shared';
import { PermissionAction, PermissionResource, UserRole } from '@nexusdesk/types';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { InvitationsService } from '../services/invitations.js';

export async function registerInvitationRoutes(app: FastifyInstance): Promise<void> {
  const invitations = () => new InvitationsService(app.prisma);

  app.get(
    API_ROUTES.invitations.root,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.Invitation, PermissionAction.Read)] },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      return invitations().list(orgId);
    },
  );

  app.post(
    API_ROUTES.invitations.root,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.Invitation, PermissionAction.Invite)] },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      const body = z.object({
        email: z.string().email(),
        role: z.nativeEnum(UserRole).default(UserRole.Viewer),
      }).parse(req.body);
      return invitations().create(orgId, req.authUser!.sub, body);
    },
  );

  app.delete(
    API_ROUTES.invitations.byId,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.Invitation, PermissionAction.Delete)] },
    async (req) => {
      const { orgId, invitationId } = req.params as { orgId: string; invitationId: string };
      return invitations().revoke(orgId, invitationId, req.authUser!.sub);
    },
  );

  app.post(API_ROUTES.invitations.accept, { preHandler: [requireAuth] }, async (req) => {
    const body = z.object({ token: z.string().min(10) }).parse(req.body);
    return invitations().accept(body.token, req.authUser!.sub);
  });
}
