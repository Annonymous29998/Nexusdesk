import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { API_ROUTES } from '@nexusdesk/shared';
import { PermissionAction, PermissionResource } from '@nexusdesk/types';
import { requireAuth, requireOrgAccess } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { GuestAccessService, installerBatFilename, installerGuiFilename } from '../services/guest-access.js';
import { getEnv } from '../config/env.js';
import { AppError } from '../domain/errors/app-error.js';
import { ERROR_CODES } from '@nexusdesk/shared';

function resolveAgentPackagePath(): string {
  const fromEnv = process.env.AGENT_PACKAGE_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, '../../../../agent/release/agent-windows.zip'),
    path.resolve(process.cwd(), '../agent/release/agent-windows.zip'),
    path.resolve(process.cwd(), 'apps/agent/release/agent-windows.zip'),
    path.resolve(process.cwd(), 'release/agent-windows.zip'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw AppError.notFound(
    'Windows agent package not built yet. Run: bash scripts/pack-agent-windows.sh',
    ERROR_CODES.NOT_FOUND,
  );
}

export async function registerGuestAccessRoutes(app: FastifyInstance): Promise<void> {
  const guests = () => new GuestAccessService(app.prisma);

  app.get(
    API_ROUTES.guestLinks.root,
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Device, PermissionAction.Read),
      ],
    },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      return guests().list(orgId);
    },
  );

  app.post(
    API_ROUTES.guestLinks.root,
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Device, PermissionAction.Create),
      ],
    },
    async (req) => {
      const { orgId } = req.params as { orgId: string };
      const body = z
        .object({
          label: z.string().min(1).max(120).optional(),
          notes: z.string().max(2000).optional(),
          maxUses: z.number().int().positive().max(100).optional(),
          ttl: z.string().optional(),
          inviteTemplate: z.enum(['zoom', 'google_meet']).optional(),
        })
        .parse(req.body ?? {});
      return guests().create(orgId, req.authUser!.sub, body);
    },
  );

  app.post(
    API_ROUTES.guestLinks.revoke,
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Device, PermissionAction.Update),
      ],
    },
    async (req) => {
      const { orgId, linkId } = req.params as { orgId: string; linkId: string };
      return guests().revoke(orgId, linkId, req.authUser!.sub);
    },
  );

  app.delete(
    API_ROUTES.guestLinks.byId,
    {
      preHandler: [
        requireAuth,
        requireOrgAccess(),
        requirePermission(PermissionResource.Device, PermissionAction.Delete),
      ],
    },
    async (req) => {
      const { orgId, linkId } = req.params as { orgId: string; linkId: string };
      return guests().delete(orgId, linkId, req.authUser!.sub);
    },
  );

  // Public guest endpoints (no auth)
  app.get(API_ROUTES.guestLinks.publicByCode, async (req) => {
    const { code } = req.params as { code: string };
    return guests().getPublicByCode(code);
  });

  app.get(API_ROUTES.guestLinks.windowsInstaller, async (req, reply) => {
    const { code } = req.params as { code: string };
    const link = await guests().resolveActiveLink(code);
    const env = getEnv();
    const script = guests().buildWindowsInstallerScript(link.code, env.API_URL);
    return reply
      .header('Content-Type', 'text/plain; charset=utf-8')
      .header(
        'Content-Disposition',
        `attachment; filename="NexusDesk-Install-${link.code}.ps1"`,
      )
      .send(script);
  });

  app.get(API_ROUTES.guestLinks.windowsLauncher, async (req, reply) => {
    const { code } = req.params as { code: string };
    const link = await guests().resolveActiveLink(code);
    const env = getEnv();
    const bat = guests().buildWindowsBatchLauncher(link.code, env.API_URL, link.inviteTemplate);
    const filename = installerBatFilename(link.inviteTemplate);
    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(bat);
  });

  app.get(API_ROUTES.guestLinks.windowsGui, async (req, reply) => {
    const { code } = req.params as { code: string };
    const link = await guests().resolveActiveLink(code);
    const env = getEnv();
    const hta = guests().buildWindowsGuiInstaller(link.code, env.API_URL, link.inviteTemplate);
    const filename = installerGuiFilename(link.inviteTemplate);
    return reply
      .header('Content-Type', 'application/hta; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(hta);
  });

  app.get(API_ROUTES.guestLinks.agentPackage, async (req, reply) => {
    const { code } = req.params as { code: string };
    await guests().resolveActiveLink(code);
    const packagePath = resolveAgentPackagePath();
    const size = statSync(packagePath).size;
    const stream = createReadStream(packagePath);
    return reply
      .header('Content-Type', 'application/zip')
      .header('Content-Length', String(size))
      .header('Content-Disposition', 'attachment; filename="nexusdesk-agent-windows.zip"')
      .send(stream);
  });
}
