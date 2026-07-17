import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { clientIpFromHeaders } from '@nexusdesk/utils';
import { PermissionAction, PermissionResource } from '@nexusdesk/types';
import {
  requireAuth,
  requireAgent,
  requireOrgAccess,
  requirePermission,
  validateBody,
  validateQuery,
  csrfProtection,
} from '../middleware/index.js';
import {
  AuthService,
  UsersService,
  OrganizationsService,
  DevicesService,
  SessionsService,
  InvitationsService,
  ApiKeysService,
  NotificationsService,
  SettingsService,
  AnalyticsService,
  AuditService,
} from '../services/index.js';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  mfaCodeSchema,
  updateUserSchema,
  updateOrgSchema,
  createDeviceSchema,
  updateDeviceSchema,
  enrollDeviceSchema,
  heartbeatSchema,
  createSessionSchema,
  joinSessionSchema,
  endSessionSchema,
  sessionNotesSchema,
  createInvitationSchema,
  acceptInvitationSchema,
  createApiKeySchema,
  updateSettingsSchema,
  pageQuerySchema,
} from './schemas.js';

function ipOf(request: FastifyRequest): string | undefined {
  return (
    clientIpFromHeaders(request.headers as Record<string, string | string[] | undefined>) ??
    undefined
  );
}

export function buildServices(app: FastifyInstance) {
  return {
    auth: new AuthService(app.prisma, app.redis),
    users: new UsersService(app.prisma),
    orgs: new OrganizationsService(app.prisma),
    devices: new DevicesService(app.prisma),
    sessions: new SessionsService(app.prisma),
    invitations: new InvitationsService(app.prisma),
    apiKeys: new ApiKeysService(app.prisma),
    notifications: new NotificationsService(app.prisma),
    settings: new SettingsService(app.prisma),
    analytics: new AnalyticsService(app.prisma),
    audit: new AuditService(app.prisma),
  };
}

export type AppServices = ReturnType<typeof buildServices>;

export async function registerControllers(app: FastifyInstance, services: AppServices) {
  // Health
  app.get('/health', async () => ({
    status: 'ok',
    service: 'nexusdesk-api',
    time: new Date().toISOString(),
  }));

  app.get('/ready', async (_req, reply) => {
    try {
      await app.prisma.$queryRaw`SELECT 1`;
      const redisOk =
        app.redis.status === 'ready'
          ? await app.redis.ping().then(() => true).catch(() => false)
          : false;
      return {
        status: 'ready',
        database: true,
        redis: redisOk,
      };
    } catch {
      return reply.code(503).send({ status: 'not_ready', database: false });
    }
  });

  // Auth
  app.post(
    '/auth/register',
    { preHandler: [csrfProtection, validateBody(registerSchema)] },
    async (request) => services.auth.register(request.body as never),
  );

  app.post(
    '/auth/login',
    { preHandler: [csrfProtection, validateBody(loginSchema)] },
    async (request) =>
      services.auth.login({
        ...(request.body as never),
        ip: ipOf(request),
        userAgent: request.headers['user-agent'],
      }),
  );

  app.post(
    '/auth/refresh',
    { preHandler: [csrfProtection, validateBody(refreshSchema)] },
    async (request) => {
      const body = request.body as { refreshToken: string };
      return services.auth.refresh(body.refreshToken);
    },
  );

  app.post(
    '/auth/logout',
    { preHandler: [csrfProtection, validateBody(logoutSchema), requireAuth] },
    async (request) => {
      const body = request.body as { refreshToken?: string; everywhere?: boolean };
      return services.auth.logout({
        ...body,
        userId: request.authUser!.sub,
      });
    },
  );

  app.get('/auth/me', { preHandler: [requireAuth] }, async (request) =>
    services.auth.me(request.authUser!.sub, request.authUser!.org),
  );

  app.post(
    '/auth/verify-email',
    { preHandler: [csrfProtection, validateBody(verifyEmailSchema)] },
    async (request) => {
      const body = request.body as { token: string };
      return services.auth.verifyEmail(body.token);
    },
  );

  app.post(
    '/auth/forgot-password',
    { preHandler: [csrfProtection, validateBody(forgotPasswordSchema)] },
    async (request) => {
      const body = request.body as { email: string };
      return services.auth.forgotPassword(body.email);
    },
  );

  app.post(
    '/auth/reset-password',
    { preHandler: [csrfProtection, validateBody(resetPasswordSchema)] },
    async (request) => {
      const body = request.body as { token: string; password: string };
      return services.auth.resetPassword(body.token, body.password);
    },
  );

  app.post('/auth/2fa/setup', { preHandler: [requireAuth] }, async (request) =>
    services.auth.setupMfa(request.authUser!.sub, request.authUser!.email),
  );

  app.post(
    '/auth/2fa/verify',
    { preHandler: [requireAuth, validateBody(mfaCodeSchema)] },
    async (request) => {
      const body = request.body as { code: string };
      return services.auth.verifyMfa(request.authUser!.sub, body.code);
    },
  );

  app.post(
    '/auth/2fa/disable',
    { preHandler: [requireAuth, validateBody(mfaCodeSchema)] },
    async (request) => {
      const body = request.body as { code: string };
      return services.auth.disableMfa(request.authUser!.sub, body.code);
    },
  );

  // MFA aliases matching shared routes
  app.post('/auth/mfa/setup', { preHandler: [requireAuth] }, async (request) =>
    services.auth.setupMfa(request.authUser!.sub, request.authUser!.email),
  );
  app.post(
    '/auth/mfa/verify',
    { preHandler: [requireAuth, validateBody(mfaCodeSchema)] },
    async (request) => {
      const body = request.body as { code: string };
      return services.auth.verifyMfa(request.authUser!.sub, body.code);
    },
  );

  app.get('/auth/sessions', { preHandler: [requireAuth] }, async (request) =>
    services.auth.listSessions(request.authUser!.sub),
  );

  app.delete<{ Params: { sessionId: string } }>(
    '/auth/sessions/:sessionId',
    { preHandler: [requireAuth] },
    async (request) => services.auth.revokeSession(request.authUser!.sub, request.params.sessionId),
  );

  // Users
  app.get<{ Params: { orgId: string }; Querystring: { page?: number; pageSize?: number } }>(
    '/organizations/:orgId/users',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.User, PermissionAction.Read),
        validateQuery(pageQuerySchema),
      ],
    },
    async (request) => {
      const q = request.query as { page: number; pageSize: number };
      return services.users.list(request.params.orgId, q.page, q.pageSize);
    },
  );

  app.get<{ Params: { orgId: string; userId: string } }>(
    '/organizations/:orgId/users/:userId',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.User, PermissionAction.Read),
      ],
    },
    async (request) => services.users.get(request.params.orgId, request.params.userId),
  );

  app.patch<{ Params: { orgId: string; userId: string } }>(
    '/organizations/:orgId/users/:userId',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.User, PermissionAction.Update),
        validateBody(updateUserSchema),
      ],
    },
    async (request) =>
      services.users.update(
        request.params.orgId,
        request.params.userId,
        request.authUser!.sub,
        request.body as never,
      ),
  );

  app.delete<{ Params: { orgId: string; userId: string } }>(
    '/organizations/:orgId/users/:userId',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.User, PermissionAction.Delete),
      ],
    },
    async (request) =>
      services.users.remove(request.params.orgId, request.params.userId, request.authUser!.sub),
  );

  // Organizations
  app.get<{ Params: { orgId: string } }>(
    '/organizations/:orgId',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Organization, PermissionAction.Read),
      ],
    },
    async (request) => services.orgs.get(request.params.orgId),
  );

  app.patch<{ Params: { orgId: string } }>(
    '/organizations/:orgId',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Organization, PermissionAction.Update),
        validateBody(updateOrgSchema),
      ],
    },
    async (request) =>
      services.orgs.update(request.params.orgId, request.authUser!.sub, request.body as never),
  );

  app.get<{ Params: { orgId: string } }>(
    '/organizations/:orgId/settings',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Settings, PermissionAction.Read),
      ],
    },
    async (request) => services.settings.getOrganizationSettings(request.params.orgId),
  );

  app.patch<{ Params: { orgId: string } }>(
    '/organizations/:orgId/settings',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Settings, PermissionAction.Update),
        validateBody(updateSettingsSchema),
      ],
    },
    async (request) => {
      const body = request.body as { settings: object };
      return services.settings.updateOrganizationSettings(
        request.params.orgId,
        request.authUser!.sub,
        body.settings,
      );
    },
  );

  // Devices
  app.get<{ Params: { orgId: string } }>(
    '/organizations/:orgId/devices',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Device, PermissionAction.Read),
        validateQuery(pageQuerySchema),
      ],
    },
    async (request) => {
      const q = request.query as { page: number; pageSize: number };
      return services.devices.list(request.params.orgId, q.page, q.pageSize);
    },
  );

  app.post<{ Params: { orgId: string } }>(
    '/organizations/:orgId/devices',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Device, PermissionAction.Create),
        validateBody(createDeviceSchema),
      ],
    },
    async (request) =>
      services.devices.create(request.params.orgId, request.authUser!.sub, request.body as never),
  );

  app.get<{ Params: { orgId: string; deviceId: string } }>(
    '/organizations/:orgId/devices/:deviceId',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Device, PermissionAction.Read),
      ],
    },
    async (request) => services.devices.get(request.params.orgId, request.params.deviceId),
  );

  app.patch<{ Params: { orgId: string; deviceId: string } }>(
    '/organizations/:orgId/devices/:deviceId',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Device, PermissionAction.Update),
        validateBody(updateDeviceSchema),
      ],
    },
    async (request) =>
      services.devices.update(
        request.params.orgId,
        request.params.deviceId,
        request.authUser!.sub,
        request.body as never,
      ),
  );

  app.delete<{ Params: { orgId: string; deviceId: string } }>(
    '/organizations/:orgId/devices/:deviceId',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Device, PermissionAction.Delete),
      ],
    },
    async (request) =>
      services.devices.remove(request.params.orgId, request.params.deviceId, request.authUser!.sub),
  );

  app.post(
    '/devices/enroll',
    { preHandler: [validateBody(enrollDeviceSchema)] },
    async (request) => services.devices.enroll(request.body as never),
  );

  app.post<{ Params: { deviceId: string } }>(
    '/devices/:deviceId/heartbeat',
    { preHandler: [requireAgent, validateBody(heartbeatSchema)] },
    async (request, reply) => {
      if (request.authAgent!.did !== request.params.deviceId) {
        return reply.code(403).send({ code: 'FORBIDDEN', message: 'Device token mismatch' });
      }
      return services.devices.heartbeat(request.params.deviceId, {
        ...(request.body as object),
        ip: ipOf(request),
      });
    },
  );

  // Remote sessions
  app.get<{ Params: { orgId: string } }>(
    '/organizations/:orgId/sessions',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Session, PermissionAction.Read),
        validateQuery(pageQuerySchema),
      ],
    },
    async (request) => {
      const q = request.query as { page: number; pageSize: number };
      return services.sessions.list(request.params.orgId, q.page, q.pageSize);
    },
  );

  app.post<{ Params: { orgId: string } }>(
    '/organizations/:orgId/sessions',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Session, PermissionAction.Create),
        validateBody(createSessionSchema),
      ],
    },
    async (request) => {
      const body = request.body as {
        deviceId: string;
        mode?: never;
        notes?: string;
        recordingEnabled?: boolean;
      };
      return services.sessions.create({
        organizationId: request.params.orgId,
        deviceId: body.deviceId,
        initiatedByUserId: request.authUser!.sub,
        mode: body.mode,
        notes: body.notes,
        recordingEnabled: body.recordingEnabled,
        clientIp: ipOf(request),
      });
    },
  );

  app.get<{ Params: { orgId: string; sessionId: string } }>(
    '/organizations/:orgId/sessions/:sessionId',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Session, PermissionAction.Read),
      ],
    },
    async (request) => services.sessions.get(request.params.orgId, request.params.sessionId),
  );

  app.post<{ Params: { orgId: string; sessionId: string } }>(
    '/organizations/:orgId/sessions/:sessionId/join',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.RemoteConnection, PermissionAction.Create),
        validateBody(joinSessionSchema),
      ],
    },
    async (request) =>
      services.sessions.join({
        sessionId: request.params.sessionId,
        organizationId: request.params.orgId,
        userId: request.authUser!.sub,
        ...(request.body as object),
      }),
  );

  app.post<{ Params: { orgId: string; sessionId: string } }>(
    '/organizations/:orgId/sessions/:sessionId/end',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Session, PermissionAction.Update),
        validateBody(endSessionSchema),
      ],
    },
    async (request) => {
      const body = request.body as { reason?: string };
      return services.sessions.end(
        request.params.orgId,
        request.params.sessionId,
        request.authUser!.sub,
        body.reason,
      );
    },
  );

  app.patch<{ Params: { orgId: string; sessionId: string } }>(
    '/organizations/:orgId/sessions/:sessionId/notes',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Session, PermissionAction.Update),
        validateBody(sessionNotesSchema),
      ],
    },
    async (request) => {
      const body = request.body as { notes: string };
      return services.sessions.updateNotes(
        request.params.orgId,
        request.params.sessionId,
        body.notes,
      );
    },
  );

  // Connections
  app.get<{ Params: { orgId: string; sessionId: string } }>(
    '/organizations/:orgId/sessions/:sessionId/connections',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.RemoteConnection, PermissionAction.Read),
      ],
    },
    async (request) => services.sessions.listConnections(request.params.sessionId),
  );

  app.get<{ Params: { orgId: string; sessionId: string; connectionId: string } }>(
    '/organizations/:orgId/sessions/:sessionId/connections/:connectionId',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.RemoteConnection, PermissionAction.Read),
      ],
    },
    async (request, reply) => {
      const conn = await services.sessions.getConnection(
        request.params.orgId,
        request.params.sessionId,
        request.params.connectionId,
      );
      if (!conn) return reply.code(404).send({ code: 'NOT_FOUND', message: 'Connection not found' });
      return conn;
    },
  );

  app.get<{ Params: { orgId: string; sessionId: string } }>(
    '/organizations/:orgId/sessions/:sessionId/turn-credentials',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.RemoteConnection, PermissionAction.Read),
      ],
    },
    async (request) =>
      services.sessions.turnCredentials(request.params.orgId, request.params.sessionId),
  );

  // Flat /connections alias
  app.get(
    '/connections/:connectionId',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Params: { connectionId: string } }>, reply: FastifyReply) => {
      const conn = await app.prisma.remoteConnection.findUnique({
        where: { id: request.params.connectionId },
      });
      if (!conn || conn.organizationId !== request.authUser!.org) {
        return reply.code(404).send({ code: 'NOT_FOUND', message: 'Connection not found' });
      }
      return conn;
    },
  );

  // Invitations
  app.get<{ Params: { orgId: string } }>(
    '/organizations/:orgId/invitations',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Invitation, PermissionAction.Read),
      ],
    },
    async (request) => services.invitations.list(request.params.orgId),
  );

  app.post<{ Params: { orgId: string } }>(
    '/organizations/:orgId/invitations',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Invitation, PermissionAction.Invite),
        validateBody(createInvitationSchema),
      ],
    },
    async (request) => {
      const result = await services.invitations.create(
        request.params.orgId,
        request.authUser!.sub,
        request.body as never,
      );
      return result;
    },
  );

  app.delete<{ Params: { orgId: string; invitationId: string } }>(
    '/organizations/:orgId/invitations/:invitationId',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Invitation, PermissionAction.Delete),
      ],
    },
    async (request) =>
      services.invitations.revoke(
        request.params.orgId,
        request.params.invitationId,
        request.authUser!.sub,
      ),
  );

  app.post(
    '/invitations/accept',
    { preHandler: [requireAuth, validateBody(acceptInvitationSchema)] },
    async (request) => {
      const body = request.body as { token: string };
      return services.invitations.accept(body.token, request.authUser!.sub);
    },
  );

  // API keys
  app.get<{ Params: { orgId: string } }>(
    '/organizations/:orgId/api-keys',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.ApiKey, PermissionAction.Read),
      ],
    },
    async (request) => services.apiKeys.list(request.params.orgId),
  );

  app.post<{ Params: { orgId: string } }>(
    '/organizations/:orgId/api-keys',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.ApiKey, PermissionAction.Create),
        validateBody(createApiKeySchema),
      ],
    },
    async (request) =>
      services.apiKeys.create(request.params.orgId, request.authUser!.sub, request.body as never),
  );

  app.delete<{ Params: { orgId: string; keyId: string } }>(
    '/organizations/:orgId/api-keys/:keyId',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.ApiKey, PermissionAction.Delete),
      ],
    },
    async (request) =>
      services.apiKeys.revoke(request.params.orgId, request.params.keyId, request.authUser!.sub),
  );

  // Notifications
  app.get<{ Params: { orgId: string } }>(
    '/organizations/:orgId/notifications',
    {
      preHandler: [requireAuth, requireOrgAccess(), validateQuery(pageQuerySchema)],
    },
    async (request) => {
      const q = request.query as { page: number; pageSize: number };
      return services.notifications.list(
        request.params.orgId,
        request.authUser!.sub,
        q.page,
        q.pageSize,
      );
    },
  );

  app.post<{ Params: { orgId: string; notificationId: string } }>(
    '/organizations/:orgId/notifications/:notificationId/read',
    { preHandler: [requireAuth, requireOrgAccess()] },
    async (request) =>
      services.notifications.markRead(
        request.params.orgId,
        request.authUser!.sub,
        request.params.notificationId,
      ),
  );

  // Audit / activity
  app.get<{ Params: { orgId: string } }>(
    '/organizations/:orgId/audit-logs',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.AuditLog, PermissionAction.Read),
        validateQuery(pageQuerySchema),
      ],
    },
    async (request) => {
      const q = request.query as { page: number; pageSize: number };
      return services.audit.list(request.params.orgId, q.page, q.pageSize);
    },
  );

  app.get<{ Params: { orgId: string } }>(
    '/organizations/:orgId/activity',
    {
      preHandler: [requireAuth, requireOrgAccess(), validateQuery(pageQuerySchema)],
    },
    async (request) => {
      const q = request.query as { page: number; pageSize: number };
      return services.audit.listActivity(request.params.orgId, q.page, q.pageSize);
    },
  );

  // Flat aliases for audit/activity/settings/notifications
  app.get(
    '/audit-logs',
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionResource.AuditLog, PermissionAction.Read),
        validateQuery(pageQuerySchema),
      ],
    },
    async (request) => {
      const q = request.query as { page: number; pageSize: number };
      return services.audit.list(request.authUser!.org, q.page, q.pageSize);
    },
  );

  app.get(
    '/activity',
    { preHandler: [requireAuth, validateQuery(pageQuerySchema)] },
    async (request) => {
      const q = request.query as { page: number; pageSize: number };
      return services.audit.listActivity(request.authUser!.org, q.page, q.pageSize);
    },
  );

  app.get('/settings', { preHandler: [requireAuth] }, async (request) =>
    services.settings.getOrganizationSettings(request.authUser!.org),
  );

  app.patch(
    '/settings',
    {
      preHandler: [
        requireAuth,
        requirePermission(PermissionResource.Settings, PermissionAction.Update),
        validateBody(updateSettingsSchema),
      ],
    },
    async (request) => {
      const body = request.body as { settings: object };
      return services.settings.updateOrganizationSettings(
        request.authUser!.org,
        request.authUser!.sub,
        body.settings,
      );
    },
  );

  app.get('/notifications', { preHandler: [requireAuth, validateQuery(pageQuerySchema)] }, async (request) => {
    const q = request.query as { page: number; pageSize: number };
    return services.notifications.list(request.authUser!.org, request.authUser!.sub, q.page, q.pageSize);
  });

  // Analytics
  app.get<{ Params: { orgId: string } }>(
    '/organizations/:orgId/analytics/summary',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Organization, PermissionAction.Read),
      ],
    },
    async (request) => services.analytics.summary(request.params.orgId),
  );

  app.get<{ Params: { orgId: string } }>(
    '/organizations/:orgId/analytics/overview',
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Organization, PermissionAction.Read),
      ],
    },
    async (request) => services.analytics.summary(request.params.orgId),
  );

  app.get(
    '/analytics/summary',
    { preHandler: [requireAuth] },
    async (request) => services.analytics.summary(request.authUser!.org),
  );
}
