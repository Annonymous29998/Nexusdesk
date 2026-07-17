import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { API_ROUTES } from '@nexusdesk/shared';
import { DevicePlatform, PermissionAction, PermissionResource } from '@nexusdesk/types';
import { requireAuth, requireAgent, requireOrgAccess } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { DevicesService } from '../services/devices.js';

export async function registerDeviceRoutes(app: FastifyInstance): Promise<void> {
  const devices = () => new DevicesService(app.prisma);

  app.get(
    API_ROUTES.devices.root,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.Device, PermissionAction.Read)] },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      const q = z.object({
        page: z.coerce.number().int().positive().optional(),
        pageSize: z.coerce.number().int().positive().max(100).optional(),
      }).parse(req.query);
      return devices().list(orgId, q.page, q.pageSize);
    },
  );

  app.post(
    API_ROUTES.devices.root,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.Device, PermissionAction.Create)] },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      const body = z.object({
        name: z.string().min(1).max(120),
        hostname: z.string().min(1).max(255),
        platform: z.nativeEnum(DevicePlatform).optional(),
        osVersion: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }).parse(req.body);
      return devices().create(orgId, req.authUser!.sub, body);
    },
  );

  app.get(
    API_ROUTES.devices.byId,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.Device, PermissionAction.Read)] },
    async (req) => {
      const { orgId, deviceId } = req.params as { orgId: string; deviceId: string };
      return devices().get(orgId, deviceId);
    },
  );

  app.patch(
    API_ROUTES.devices.byId,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.Device, PermissionAction.Update)] },
    async (req) => {
      const { orgId, deviceId } = req.params as { orgId: string; deviceId: string };
      const body = z.object({
        name: z.string().min(1).max(120).optional(),
        tags: z.array(z.string()).optional(),
        notes: z.string().nullable().optional(),
      }).parse(req.body);
      return devices().update(orgId, deviceId, req.authUser!.sub, body);
    },
  );

  app.delete(
    API_ROUTES.devices.byId,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.Device, PermissionAction.Delete)] },
    async (req) => {
      const { orgId, deviceId } = req.params as { orgId: string; deviceId: string };
      return devices().remove(orgId, deviceId, req.authUser!.sub);
    },
  );

  app.post(API_ROUTES.devices.enroll, async (req) => {
    const body = z
      .object({
        enrollmentToken: z.string().min(4).optional(),
        guestCode: z.string().min(4).optional(),
        organizationId: z.string().uuid().optional(),
        organizationSlug: z.string().optional(),
        hostname: z.string().min(1),
        platform: z.nativeEnum(DevicePlatform).default(DevicePlatform.Unknown),
        osVersion: z.string().default(''),
        agentVersion: z.string().default('0.1.0'),
        publicKey: z.string().min(8),
        metadata: z.record(z.string()).optional(),
      })
      .refine((v) => Boolean(v.enrollmentToken || v.guestCode), {
        message: 'enrollmentToken or guestCode is required',
      })
      .parse(req.body);
    return devices().enroll(body);
  });

  app.post(API_ROUTES.devices.heartbeat, { preHandler: [requireAgent] }, async (req) => {
    const { deviceId } = req.params as { deviceId: string };
    if (req.authAgent!.did !== deviceId) {
      return { ok: false };
    }
    const body = z.object({
      cpuPercent: z.number().optional(),
      memoryPercent: z.number().optional(),
      agentVersion: z.string().optional(),
      ipAddress: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
    }).parse(req.body ?? {});
    return devices().heartbeat(deviceId, body);
  });

  app.post(
    API_ROUTES.devices.commands,
    { preHandler: [requireAuth, requireOrgAccess(), requirePermission(PermissionResource.Device, PermissionAction.Control)] },
    async (req) => {
      const { orgId, deviceId } = req.params as { orgId: string; deviceId: string };
      const body = z.object({
        type: z.string().min(1),
        payload: z.record(z.unknown()).default({}),
      }).parse(req.body);
      // Commands are delivered via WebSocket; persist as activity
      await devices().get(orgId, deviceId);
      const gateway = (app as { agentGateway?: { sendCommand: (id: string, cmd: unknown) => boolean } }).agentGateway;
      const sent = gateway?.sendCommand(deviceId, {
        id: crypto.randomUUID(),
        type: body.type,
        payload: body.payload,
        issuedAt: new Date().toISOString(),
      }) ?? false;
      return { queued: sent, deviceId, type: body.type };
    },
  );
}
