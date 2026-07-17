import type { PrismaClient } from '@prisma/client';
import { DEFAULT_AGENT_SETTINGS, ERROR_CODES } from '@nexusdesk/shared';
import { DeviceStatus } from '@nexusdesk/types';
import { hashToken, createAgentToken } from '../lib/tokens.js';
import { getEnv } from '../config/env.js';
import { AppError } from '../domain/errors/app-error.js';
import {
  DeviceRepository,
  DeviceTokenRepository,
  OrganizationRepository,
} from '../repositories/index.js';
import { AuditService } from './audit.js';

export class DevicesService {
  private readonly devices: DeviceRepository;
  private readonly deviceTokens: DeviceTokenRepository;
  private readonly orgs: OrganizationRepository;
  private readonly audit: AuditService;

  constructor(private readonly prisma: PrismaClient) {
    this.devices = new DeviceRepository(prisma);
    this.deviceTokens = new DeviceTokenRepository(prisma);
    this.orgs = new OrganizationRepository(prisma);
    this.audit = new AuditService(prisma);
  }

  list(organizationId: string, page?: number, pageSize?: number) {
    return this.devices.list(organizationId, page, pageSize);
  }

  async get(organizationId: string, deviceId: string) {
    const device = await this.devices.findInOrg(organizationId, deviceId);
    if (!device) throw AppError.notFound('Device not found', ERROR_CODES.DEVICE_NOT_FOUND);
    return device;
  }

  async create(
    organizationId: string,
    actorUserId: string,
    data: {
      name: string;
      hostname: string;
      platform?: string;
      osVersion?: string;
      tags?: string[];
    },
  ) {
    const org = await this.orgs.findById(organizationId);
    if (!org) throw AppError.notFound('Organization not found', ERROR_CODES.ORG_NOT_FOUND);
    const count = await this.devices.countActive(organizationId);
    if (count >= org.maxDevices) {
      throw AppError.badRequest('Device limit reached', ERROR_CODES.DEVICE_LIMIT_REACHED);
    }

    const device = await this.devices.create({
      organizationId,
      name: data.name,
      hostname: data.hostname,
      platform: data.platform ?? 'unknown',
      osVersion: data.osVersion ?? '',
      agentVersion: '',
      enrolledByUserId: actorUserId,
      status: DeviceStatus.Pending,
    });

    if (data.tags?.length) {
      await this.devices.update(device.id, { tags: data.tags });
    }

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'device.create',
      resourceType: 'device',
      resourceId: device.id,
      after: { name: data.name, hostname: data.hostname },
    });

    return this.get(organizationId, device.id);
  }

  async update(
    organizationId: string,
    deviceId: string,
    actorUserId: string,
    data: Record<string, unknown>,
  ) {
    await this.get(organizationId, deviceId);
    await this.devices.update(deviceId, data);
    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'device.update',
      resourceType: 'device',
      resourceId: deviceId,
      after: data,
    });
    return this.get(organizationId, deviceId);
  }

  async remove(organizationId: string, deviceId: string, actorUserId: string) {
    await this.get(organizationId, deviceId);
    await this.devices.softDelete(deviceId);
    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'device.delete',
      resourceType: 'device',
      resourceId: deviceId,
    });
    return { ok: true };
  }

  async enroll(input: {
    enrollmentToken?: string;
    guestCode?: string;
    hostname: string;
    platform: string;
    osVersion: string;
    agentVersion: string;
    publicKey: string;
    metadata?: Record<string, string>;
    organizationId?: string;
    organizationSlug?: string;
  }) {
    const env = getEnv();
    const { GuestAccessService } = await import('./guest-access.js');
    const guestAccess = new GuestAccessService(this.prisma);

    let org;
    let guestLinkId: string | undefined;

    const guestCode = input.guestCode?.trim() || undefined;
    const enrollmentToken = input.enrollmentToken?.trim() || undefined;

    if (guestCode) {
      const link = await guestAccess.resolveActiveLink(guestCode);
      guestLinkId = link.id;
      org = await this.orgs.findById(link.organizationId);
    } else if (enrollmentToken) {
      const guestByToken = await guestAccess.findByEnrollmentToken(enrollmentToken);
      if (guestByToken) {
        const link = await guestAccess.resolveActiveLink(guestByToken.code);
        guestLinkId = link.id;
        org = await this.orgs.findById(link.organizationId);
      } else if (enrollmentToken === env.AGENT_ENROLLMENT_SECRET) {
        if (input.organizationId) {
          org = await this.orgs.findById(input.organizationId);
        } else if (input.organizationSlug) {
          org = await this.orgs.findBySlug(input.organizationSlug);
        } else {
          org = await this.prisma.organization.findFirst({
            where: { deletedAt: null },
            orderBy: { createdAt: 'asc' },
          });
        }
      } else {
        // Treat short codes pasted as enrollmentToken as guest codes.
        if (/^[A-Za-z0-9]{6,12}$/.test(enrollmentToken)) {
          const link = await guestAccess.resolveActiveLink(enrollmentToken);
          guestLinkId = link.id;
          org = await this.orgs.findById(link.organizationId);
        } else {
          throw AppError.unauthorized('Invalid enrollment token', ERROR_CODES.ENROLLMENT_INVALID);
        }
      }
    } else {
      throw AppError.unauthorized('Enrollment token or guest code required', ERROR_CODES.ENROLLMENT_INVALID);
    }

    if (!org) throw AppError.notFound('Organization not found', ERROR_CODES.ORG_NOT_FOUND);

    const existing = await this.devices.findByHostname(org.id, input.hostname);
    let device;
    if (existing) {
      // Reinstall / new support link on the same PC should refresh the existing row.
      device = await this.devices.update(existing.id, {
        name: input.hostname,
        platform: input.platform,
        osVersion: input.osVersion,
        agentVersion: input.agentVersion,
        publicKey: input.publicKey,
        metadata: {
          ...((existing.metadata as Record<string, unknown> | null) ?? {}),
          ...(input.metadata ?? {}),
          ...(guestLinkId ? { guestLinkId } : {}),
        },
        status: DeviceStatus.Online,
        lastSeenAt: new Date(),
        deletedAt: null,
      });
    } else {
      const count = await this.devices.countActive(org.id);
      if (count >= org.maxDevices) {
        throw AppError.badRequest('Device limit reached', ERROR_CODES.DEVICE_LIMIT_REACHED);
      }

      device = await this.devices.create({
        organizationId: org.id,
        name: input.hostname,
        hostname: input.hostname,
        platform: input.platform,
        osVersion: input.osVersion,
        agentVersion: input.agentVersion,
        publicKey: input.publicKey,
        metadata: {
          ...(input.metadata ?? {}),
          ...(guestLinkId ? { guestLinkId } : {}),
        },
        status: DeviceStatus.Online,
      });
      await this.devices.update(device.id, { lastSeenAt: new Date() });
    }

    if (guestLinkId) {
      await guestAccess.consume(guestLinkId, device.id);
    }

    const agent = createAgentToken({ deviceId: device.id, organizationId: org.id });
    await this.deviceTokens.create({
      deviceId: device.id,
      organizationId: org.id,
      tokenHash: hashToken(agent.token),
      jti: agent.claims.jti,
      expiresAt: agent.expiresAt,
    });

    const refresh = createAgentToken({
      deviceId: device.id,
      organizationId: org.id,
      ttl: '30d',
    });

    await this.audit.logActivity({
      organizationId: org.id,
      actorType: 'agent',
      action: 'device.enroll',
      resourceType: 'device',
      resourceId: device.id,
      message: guestLinkId
        ? `Guest device ${input.hostname} enrolled via support link`
        : `Device ${input.hostname} enrolled`,
    });

    return {
      deviceId: device.id,
      organizationId: org.id,
      deviceToken: agent.token,
      refreshToken: refresh.token,
      heartbeatIntervalMs: DEFAULT_AGENT_SETTINGS.heartbeatIntervalMs,
      wsUrl: env.WS_URL,
    };
  }

  async heartbeat(
    deviceId: string,
    data: {
      agentVersion?: string;
      status?: string;
      ip?: string;
      hostname?: string;
      osVersion?: string;
      metadata?: object;
    },
  ) {
    const device = await this.devices.findById(deviceId);
    if (!device) throw AppError.notFound('Device not found', ERROR_CODES.DEVICE_NOT_FOUND);
    if (device.status === DeviceStatus.Disabled) {
      throw AppError.forbidden('Device disabled', ERROR_CODES.DEVICE_DISABLED);
    }

    await this.devices.update(deviceId, {
      lastSeenAt: new Date(),
      status: (data.status as never) ?? DeviceStatus.Online,
      ...(data.agentVersion ? { agentVersion: data.agentVersion } : {}),
      ...(data.ip ? { lastIp: data.ip } : {}),
      ...(data.hostname ? { hostname: data.hostname } : {}),
      ...(data.osVersion ? { osVersion: data.osVersion } : {}),
      ...(data.metadata ? { metadata: data.metadata } : {}),
    });

    return { ok: true, serverTime: new Date().toISOString() };
  }

  async markOffline(deviceId: string) {
    const device = await this.devices.findById(deviceId);
    if (!device || device.status === DeviceStatus.Disabled) return;
    await this.devices.update(deviceId, { status: DeviceStatus.Offline });
  }
}
