import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { API_ROUTES } from '@nexusdesk/shared';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';
import { NotificationsService } from '../services/invitations.js';

export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  const notifications = () => new NotificationsService(app.prisma);

  app.get(
    API_ROUTES.notifications.root,
    { preHandler: [requireAuth, requireOrgAccess()] },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      const q = z.object({
        page: z.coerce.number().int().positive().optional(),
        pageSize: z.coerce.number().int().positive().max(100).optional(),
      }).parse(req.query);
      return notifications().list(orgId, req.authUser!.sub, q.page, q.pageSize);
    },
  );

  app.post(
    API_ROUTES.notifications.markRead,
    { preHandler: [requireAuth, requireOrgAccess()] },
    async (req) => {
      const { orgId, notificationId } = req.params as { orgId: string; notificationId: string };
      return notifications().markRead(orgId, req.authUser!.sub, notificationId);
    },
  );
}
