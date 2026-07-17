import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { API_ROUTES } from '@nexusdesk/shared';
import { PermissionAction, PermissionResource, RemoteConnectionMode } from '@nexusdesk/types';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { SessionsService } from '../services/sessions.js';
import { AppError } from '../domain/errors/app-error.js';

export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  const sessions = () => new SessionsService(app.prisma);

  app.get(
    API_ROUTES.sessions.root,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.Session, PermissionAction.Read)] },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      const q = z.object({
        page: z.coerce.number().int().positive().optional(),
        pageSize: z.coerce.number().int().positive().max(100).optional(),
      }).parse(req.query);
      return sessions().list(orgId, q.page, q.pageSize);
    },
  );

  app.post(
    API_ROUTES.sessions.root,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.Session, PermissionAction.Create)] },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      const body = z.object({
        deviceId: z.string().uuid(),
        mode: z.nativeEnum(RemoteConnectionMode).optional(),
        notes: z.string().nullable().optional(),
        recordingEnabled: z.boolean().optional(),
      }).parse(req.body);
      return sessions().create({
        organizationId: orgId,
        deviceId: body.deviceId,
        initiatedByUserId: req.authUser!.sub,
        mode: body.mode,
        notes: body.notes,
        recordingEnabled: body.recordingEnabled,
        clientIp: req.ip,
      });
    },
  );

  app.get(
    API_ROUTES.sessions.byId,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.Session, PermissionAction.Read)] },
    async (req) => {
      const { orgId, sessionId } = req.params as { orgId: string; sessionId: string };
      return sessions().get(orgId, sessionId);
    },
  );

  app.post(
    API_ROUTES.sessions.end,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.Session, PermissionAction.Update)] },
    async (req) => {
      const { orgId, sessionId } = req.params as { orgId: string; sessionId: string };
      const body = z.object({ reason: z.string().optional() }).parse(req.body ?? {});
      return sessions().end(orgId, sessionId, req.authUser!.sub, body.reason);
    },
  );

  app.patch(
    API_ROUTES.sessions.byId,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.Session, PermissionAction.Update)] },
    async (req) => {
      const { orgId, sessionId } = req.params as { orgId: string; sessionId: string };
      const body = z.object({ notes: z.string() }).parse(req.body);
      return sessions().updateNotes(orgId, sessionId, body.notes);
    },
  );

  app.post(
    '/organizations/:orgId/sessions/:sessionId/join',
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.RemoteConnection, PermissionAction.Create)] },
    async (req) => {
      const { orgId, sessionId } = req.params as { orgId: string; sessionId: string };
      const body = z.object({
        mode: z.nativeEnum(RemoteConnectionMode).optional(),
        peerId: z.string().optional(),
      }).parse(req.body ?? {});
      return sessions().join({
        sessionId,
        organizationId: orgId,
        userId: req.authUser!.sub,
        mode: body.mode,
        peerId: body.peerId,
      });
    },
  );

  app.get(
    API_ROUTES.connections.root,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.RemoteConnection, PermissionAction.Read)] },
    async (req) => {
      const { sessionId } = req.params as { sessionId: string };
      return sessions().listConnections(sessionId);
    },
  );

  app.get(
    API_ROUTES.connections.byId,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.RemoteConnection, PermissionAction.Read)] },
    async (req) => {
      const { orgId, sessionId, connectionId } = req.params as {
        orgId: string; sessionId: string; connectionId: string;
      };
      const conn = await sessions().getConnection(orgId, sessionId, connectionId);
      if (!conn) throw AppError.notFound('Connection not found');
      return conn;
    },
  );

  app.get(
    API_ROUTES.connections.turn,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.RemoteConnection, PermissionAction.Read)] },
    async (req) => {
      const { orgId, sessionId } = req.params as { orgId: string; sessionId: string };
      await sessions().get(orgId, sessionId);
      return sessions().turnCredentials(orgId, sessionId);
    },
  );
}
