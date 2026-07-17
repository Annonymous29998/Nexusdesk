import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { ERROR_CODES, TOKEN_DEFAULTS } from '@nexusdesk/shared';
import {
  InvitationStatus,
  ApiKeyStatus,
  NotificationStatus,
  UserRole,
} from '@nexusdesk/types';
import {
  hashSecret,
  parseDuration,
  randomAlphanumeric,
  randomToken,
} from '@nexusdesk/utils';
import { getEnv } from '../config/env.js';
import { AppError } from '../domain/errors/app-error.js';
import { sendMail } from '../lib/mailer.js';
import { hashToken } from '../lib/tokens.js';
import {
  ApiKeyRepository,
  InvitationRepository,
  NotificationRepository,
  OrganizationRepository,
  SettingRepository,
  UserRepository,
} from '../repositories/index.js';
import { AuditService } from './audit.js';

export class InvitationsService {
  private readonly invitations: InvitationRepository;
  private readonly orgs: OrganizationRepository;
  private readonly users: UserRepository;
  private readonly audit: AuditService;

  constructor(private readonly prisma: PrismaClient) {
    this.invitations = new InvitationRepository(prisma);
    this.orgs = new OrganizationRepository(prisma);
    this.users = new UserRepository(prisma);
    this.audit = new AuditService(prisma);
  }

  list(organizationId: string) {
    return this.invitations.list(organizationId);
  }

  async create(
    organizationId: string,
    actorUserId: string,
    data: { email: string; role: UserRole },
  ) {
    if (data.role === UserRole.Owner || data.role === UserRole.Agent) {
      throw AppError.badRequest('Cannot invite with this role');
    }
    const org = await this.orgs.findById(organizationId);
    if (!org) throw AppError.notFound('Organization not found', ERROR_CODES.ORG_NOT_FOUND);

    const members = await this.orgs.listMembers(organizationId);
    if (members.length >= org.maxSeats) {
      throw AppError.badRequest('Seat limit reached', ERROR_CODES.SEAT_LIMIT_REACHED);
    }

    const token = randomToken(32);
    const invitation = await this.invitations.create({
      organizationId,
      email: data.email,
      role: data.role,
      invitedByUserId: actorUserId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + parseDuration(TOKEN_DEFAULTS.invitationTtl)),
    });

    const env = getEnv();
    await sendMail({
      to: data.email,
      subject: `Join ${org.name} on NexusDesk`,
      text: `You have been invited to ${org.name}.\nAccept: ${env.APP_URL}/invitations/accept?token=${token}\n`,
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'invitation.create',
      resourceType: 'invitation',
      resourceId: invitation.id,
      after: { email: data.email, role: data.role },
    });

    return { invitation, token };
  }

  async revoke(organizationId: string, invitationId: string, actorUserId: string) {
    const invitation = await this.invitations.findById(invitationId);
    if (!invitation || invitation.organizationId !== organizationId) {
      throw AppError.notFound('Invitation not found');
    }
    await this.invitations.update(invitationId, { status: InvitationStatus.Revoked });
    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'invitation.revoke',
      resourceType: 'invitation',
      resourceId: invitationId,
    });
    return { ok: true };
  }

  async accept(token: string, userId: string) {
    const invitation = await this.invitations.findByTokenHash(hashToken(token));
    if (!invitation || invitation.status !== InvitationStatus.Pending) {
      throw AppError.badRequest('Invalid invitation', ERROR_CODES.INVITATION_INVALID);
    }
    if (invitation.expiresAt < new Date()) {
      await this.invitations.update(invitation.id, { status: InvitationStatus.Expired });
      throw AppError.badRequest('Invitation expired', ERROR_CODES.INVITATION_EXPIRED);
    }

    const user = await this.users.findById(userId);
    if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw AppError.forbidden('Invitation email mismatch');
    }

    const existing = await this.orgs.findMembership(invitation.organizationId, userId);
    if (!existing) {
      await this.orgs.addMember(invitation.organizationId, userId, invitation.role as UserRole);
    }

    await this.invitations.update(invitation.id, {
      status: InvitationStatus.Accepted,
      acceptedAt: new Date(),
      acceptedUserId: userId,
    });

    return { organizationId: invitation.organizationId, role: invitation.role };
  }
}

export class ApiKeysService {
  private readonly keys: ApiKeyRepository;
  private readonly audit: AuditService;

  constructor(prisma: PrismaClient) {
    this.keys = new ApiKeyRepository(prisma);
    this.audit = new AuditService(prisma);
  }

  list(organizationId: string) {
    return this.keys.list(organizationId);
  }

  async create(
    organizationId: string,
    actorUserId: string,
    data: { name: string; scopes?: string[]; expiresAt?: string | null },
  ) {
    const raw = `ndk_${randomAlphanumeric(40)}`;
    const prefix = raw.slice(0, TOKEN_DEFAULTS.apiKeyPrefixLength);
    const created = await this.keys.create({
      organizationId,
      name: data.name,
      prefix,
      keyHash: hashSecret(raw),
      scopes: data.scopes ?? ['*'],
      createdByUserId: actorUserId,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'api_key.create',
      resourceType: 'api_key',
      resourceId: created.id,
      after: { name: data.name, prefix },
    });

    return { apiKey: created, secret: raw };
  }

  async revoke(organizationId: string, keyId: string, actorUserId: string) {
    const key = await this.keys.findById(keyId);
    if (!key || key.organizationId !== organizationId) {
      throw AppError.notFound('API key not found');
    }
    await this.keys.update(keyId, {
      status: ApiKeyStatus.Revoked,
      revokedAt: new Date(),
    });
    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'api_key.revoke',
      resourceType: 'api_key',
      resourceId: keyId,
    });
    return { ok: true };
  }
}

export class NotificationsService {
  private readonly notifications: NotificationRepository;

  constructor(prisma: PrismaClient) {
    this.notifications = new NotificationRepository(prisma);
  }

  list(organizationId: string, userId: string, page?: number, pageSize?: number) {
    return this.notifications.listForUser(organizationId, userId, page, pageSize);
  }

  async markRead(organizationId: string, userId: string, notificationId: string) {
    const n = await this.notifications.findById(notificationId);
    if (!n || n.organizationId !== organizationId || n.userId !== userId) {
      throw AppError.notFound('Notification not found');
    }
    if (n.status === NotificationStatus.Read) return n;
    return this.notifications.markRead(notificationId);
  }

  create(data: {
    organizationId: string;
    userId: string;
    title: string;
    body: string;
    href?: string | null;
  }) {
    return this.notifications.create(data);
  }
}

export class SettingsService {
  private readonly settings: SettingRepository;
  private readonly orgs: OrganizationRepository;
  private readonly audit: AuditService;

  constructor(prisma: PrismaClient) {
    this.settings = new SettingRepository(prisma);
    this.orgs = new OrganizationRepository(prisma);
    this.audit = new AuditService(prisma);
  }

  async getOrganizationSettings(organizationId: string) {
    const org = await this.orgs.findById(organizationId);
    if (!org) throw AppError.notFound('Organization not found', ERROR_CODES.ORG_NOT_FOUND);
    const extras = await this.settings.listOrgSettings(organizationId);
    return {
      organizationId,
      settings: org.settings,
      extras: Object.fromEntries(extras.map((s) => [s.key, s.value])),
    };
  }

  async updateOrganizationSettings(
    organizationId: string,
    actorUserId: string,
    settings: object,
  ) {
    const org = await this.orgs.findById(organizationId);
    if (!org) throw AppError.notFound('Organization not found', ERROR_CODES.ORG_NOT_FOUND);
    const merged = {
      ...(typeof org.settings === 'object' && org.settings ? org.settings : {}),
      ...settings,
    };
    await this.orgs.update(organizationId, { settings: merged });
    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'settings.update',
      resourceType: 'settings',
      resourceId: organizationId,
      after: settings,
    });
    return this.getOrganizationSettings(organizationId);
  }

  upsertKey(organizationId: string, key: string, value: object) {
    return this.settings.upsertOrgSetting(organizationId, key, value);
  }
}

export class AnalyticsService {
  constructor(private readonly prisma: PrismaClient) {}

  async summary(organizationId: string) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setHours(0, 0, 0, 0);
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);

    const [
      deviceTotal,
      deviceOnline,
      sessionActive,
      sessionEnded,
      sessionsToday,
      memberCount,
      invitationPending,
      recentSessions,
      devices,
      sessionsInWindow,
    ] = await Promise.all([
      this.prisma.device.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.device.count({
        where: { organizationId, deletedAt: null, status: 'online' },
      }),
      this.prisma.remoteSession.count({
        where: {
          organizationId,
          status: { in: ['pending', 'connecting', 'active', 'paused'] },
        },
      }),
      this.prisma.remoteSession.count({
        where: { organizationId, status: 'ended' },
      }),
      this.prisma.remoteSession.count({
        where: {
          organizationId,
          createdAt: { gte: startOfToday },
        },
      }),
      this.prisma.organizationMember.count({ where: { organizationId } }),
      this.prisma.invitation.count({
        where: { organizationId, status: 'pending' },
      }),
      this.prisma.remoteSession.findMany({
        where: { organizationId, startedAt: { not: null }, endedAt: { not: null } },
        select: { startedAt: true, endedAt: true },
        take: 500,
        orderBy: { endedAt: 'desc' },
      }),
      this.prisma.device.findMany({
        where: { organizationId, deletedAt: null },
        select: { platform: true, status: true },
      }),
      this.prisma.remoteSession.findMany({
        where: { organizationId, createdAt: { gte: fourteenDaysAgo } },
        select: { createdAt: true },
      }),
    ]);

    let totalDurationMs = 0;
    for (const s of recentSessions) {
      if (s.startedAt && s.endedAt) {
        totalDurationMs += s.endedAt.getTime() - s.startedAt.getTime();
      }
    }
    const avgDurationMs =
      recentSessions.length > 0 ? Math.round(totalDurationMs / recentSessions.length) : 0;
    const avgSessionMinutes = Math.round(avgDurationMs / 60_000);

    const dayKey = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const sessionsByDay = new Map<string, number>();
    const durationByDayMs = new Map<string, number>();
    for (const s of sessionsInWindow) {
      const key = dayKey(s.createdAt);
      sessionsByDay.set(key, (sessionsByDay.get(key) ?? 0) + 1);
    }
    for (const s of recentSessions) {
      if (!s.startedAt || !s.endedAt) continue;
      const key = dayKey(s.endedAt);
      const ms = Math.max(0, s.endedAt.getTime() - s.startedAt.getTime());
      durationByDayMs.set(key, (durationByDayMs.get(key) ?? 0) + ms);
    }

    const series = Array.from({ length: 14 }, (_, i) => {
      const date = new Date(fourteenDaysAgo);
      date.setDate(fourteenDaysAgo.getDate() + i);
      const key = dayKey(date);
      const sessions = sessionsByDay.get(key) ?? 0;
      // Rough transfer estimate (~1.5 Mbps average remote desktop) for chart axis.
      const durationHours = (durationByDayMs.get(key) ?? 0) / 3_600_000;
      const bytesGb = Number((durationHours * 0.675).toFixed(2));
      return {
        date: key,
        sessions,
        devicesOnline: deviceOnline,
        bytesGb,
      };
    });

    const byPlatformMap = new Map<string, number>();
    const byStatusMap = new Map<string, number>();
    for (const d of devices) {
      byPlatformMap.set(d.platform, (byPlatformMap.get(d.platform) ?? 0) + 1);
      byStatusMap.set(d.status, (byStatusMap.get(d.status) ?? 0) + 1);
    }

    return {
      organizationId,
      generatedAt: new Date().toISOString(),
      devices: { total: deviceTotal, online: deviceOnline, offline: deviceTotal - deviceOnline },
      sessions: {
        active: sessionActive,
        ended: sessionEnded,
        today: sessionsToday,
        averageDurationMs: avgDurationMs,
        sampleSize: recentSessions.length,
      },
      members: memberCount,
      invitationsPending: invitationPending,
      correlationId: randomUUID(),
      // Flat overview shape used by the dashboard Overview / Analytics pages
      devicesOnline: deviceOnline,
      devicesTotal: deviceTotal,
      activeSessions: sessionActive,
      sessionsToday,
      avgSessionMinutes,
      usersActive: memberCount,
      series,
      byPlatform: [...byPlatformMap.entries()].map(([platform, count]) => ({ platform, count })),
      byStatus: [...byStatusMap.entries()].map(([status, count]) => ({ status, count })),
    };
  }
}
