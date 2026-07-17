import type { PrismaClient } from '@prisma/client';
import type { UserRole } from '@nexusdesk/types';
import { DEFAULT_PAGINATION } from '@nexusdesk/shared';

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findById(id: string) {
    return this.prisma.user.findFirst({ where: { id, deletedAt: null } });
  }

  findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
    });
  }

  create(data: {
    email: string;
    passwordHash: string;
    passwordSalt: string;
    displayName: string;
  }) {
    return this.prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash: data.passwordHash,
        passwordSalt: data.passwordSalt,
        displayName: data.displayName,
      },
    });
  }

  update(id: string, data: Record<string, unknown>) {
    return this.prisma.user.update({ where: { id }, data });
  }

  async listByOrganization(organizationId: string, page = 1, pageSize = DEFAULT_PAGINATION.pageSize as number) {
    const where = {
      deletedAt: null,
      memberships: { some: { organizationId } },
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          memberships: { where: { organizationId } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, pageSize, hasMore: page * pageSize < total };
  }
}

export class OrganizationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findById(id: string) {
    return this.prisma.organization.findFirst({ where: { id, deletedAt: null } });
  }

  findBySlug(slug: string) {
    return this.prisma.organization.findFirst({ where: { slug, deletedAt: null } });
  }

  create(data: {
    name: string;
    slug: string;
    ownerUserId: string;
    settings?: object;
  }) {
    return this.prisma.organization.create({
      data: {
        name: data.name,
        slug: data.slug,
        ownerUserId: data.ownerUserId,
        settings: data.settings ?? {},
      },
    });
  }

  update(id: string, data: Record<string, unknown>) {
    return this.prisma.organization.update({ where: { id }, data });
  }

  addMember(organizationId: string, userId: string, role: UserRole) {
    return this.prisma.organizationMember.create({
      data: { organizationId, userId, role },
    });
  }

  findMembership(organizationId: string, userId: string) {
    return this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
  }

  listMembers(organizationId: string) {
    return this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    });
  }

  updateMemberRole(organizationId: string, userId: string, role: UserRole) {
    return this.prisma.organizationMember.update({
      where: { organizationId_userId: { organizationId, userId } },
      data: { role },
    });
  }

  removeMember(organizationId: string, userId: string) {
    return this.prisma.organizationMember.delete({
      where: { organizationId_userId: { organizationId, userId } },
    });
  }
}

export class DeviceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findById(id: string) {
    return this.prisma.device.findFirst({ where: { id, deletedAt: null } });
  }

  findInOrg(organizationId: string, id: string) {
    return this.prisma.device.findFirst({
      where: { id, organizationId, deletedAt: null },
    });
  }

  findByHostname(organizationId: string, hostname: string) {
    return this.prisma.device.findFirst({
      where: { organizationId, hostname, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });
  }

  create(data: {
    organizationId: string;
    name: string;
    hostname: string;
    platform: string;
    osVersion: string;
    agentVersion: string;
    enrolledByUserId?: string | null;
    publicKey?: string | null;
    metadata?: object;
    status?: string;
  }) {
    return this.prisma.device.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        hostname: data.hostname,
        platform: data.platform as never,
        osVersion: data.osVersion,
        agentVersion: data.agentVersion,
        enrolledByUserId: data.enrolledByUserId ?? null,
        publicKey: data.publicKey ?? null,
        metadata: data.metadata ?? {},
        status: (data.status as never) ?? 'pending',
      },
    });
  }

  update(id: string, data: Record<string, unknown>) {
    return this.prisma.device.update({ where: { id }, data });
  }

  softDelete(id: string) {
    return this.prisma.device.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'disabled' },
    });
  }

  async list(organizationId: string, page = 1, pageSize = DEFAULT_PAGINATION.pageSize as number) {
    const where = { organizationId, deletedAt: null };
    const [items, total] = await Promise.all([
      this.prisma.device.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.device.count({ where }),
    ]);
    return { items, total, page, pageSize, hasMore: page * pageSize < total };
  }

  countActive(organizationId: string) {
    return this.prisma.device.count({
      where: { organizationId, deletedAt: null, status: { not: 'disabled' } },
    });
  }
}

export class AuthSessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: {
    userId: string;
    organizationId?: string | null;
    userAgent?: string | null;
    ipAddress?: string | null;
    expiresAt: Date;
  }) {
    return this.prisma.authSession.create({ data });
  }

  findById(id: string) {
    return this.prisma.authSession.findUnique({ where: { id } });
  }

  listByUser(userId: string) {
    return this.prisma.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastActiveAt: 'desc' },
    });
  }

  revoke(id: string) {
    return this.prisma.authSession.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  revokeAllForUser(userId: string) {
    return this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  touch(id: string) {
    return this.prisma.authSession.update({
      where: { id },
      data: { lastActiveAt: new Date() },
    });
  }
}

export class RefreshTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: {
    userId: string;
    sessionId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.prisma.refreshToken.create({ data });
  }

  findByHash(tokenHash: string) {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  revoke(id: string, replacedById?: string) {
    return this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date(), replacedById: replacedById ?? null },
    });
  }

  revokeFamily(familyId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export class DeviceTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: {
    deviceId: string;
    organizationId: string;
    tokenHash: string;
    jti: string;
    expiresAt: Date;
  }) {
    return this.prisma.deviceToken.create({ data });
  }

  findByJti(jti: string) {
    return this.prisma.deviceToken.findUnique({ where: { jti } });
  }

  revoke(id: string) {
    return this.prisma.deviceToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  touch(jti: string) {
    return this.prisma.deviceToken.update({
      where: { jti },
      data: { lastUsedAt: new Date() },
    });
  }
}

export class RemoteSessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: {
    organizationId: string;
    deviceId: string;
    initiatedByUserId: string;
    mode: string;
    clientIp?: string | null;
    recordingEnabled?: boolean;
    notes?: string | null;
    metadata?: object;
  }) {
    return this.prisma.remoteSession.create({
      data: {
        organizationId: data.organizationId,
        deviceId: data.deviceId,
        initiatedByUserId: data.initiatedByUserId,
        mode: data.mode as never,
        clientIp: data.clientIp ?? null,
        recordingEnabled: data.recordingEnabled ?? false,
        notes: data.notes ?? null,
        metadata: data.metadata ?? {},
        status: 'pending',
        startedAt: new Date(),
      },
    });
  }

  findById(id: string) {
    return this.prisma.remoteSession.findUnique({
      where: { id },
      include: { connections: true },
    });
  }

  findInOrg(organizationId: string, id: string) {
    return this.prisma.remoteSession.findFirst({
      where: { id, organizationId },
      include: { connections: true },
    });
  }

  update(id: string, data: Record<string, unknown>) {
    return this.prisma.remoteSession.update({ where: { id }, data });
  }

  async list(organizationId: string, page = 1, pageSize = DEFAULT_PAGINATION.pageSize as number) {
    const where = { organizationId };
    const [items, total] = await Promise.all([
      this.prisma.remoteSession.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: { connections: true },
      }),
      this.prisma.remoteSession.count({ where }),
    ]);
    return { items, total, page, pageSize, hasMore: page * pageSize < total };
  }

  countActiveForDevice(deviceId: string) {
    return this.prisma.remoteSession.count({
      where: {
        deviceId,
        status: { in: ['pending', 'connecting', 'active', 'paused'] },
      },
    });
  }
}

export class RemoteConnectionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: {
    sessionId: string;
    organizationId: string;
    deviceId: string;
    userId: string;
    mode: string;
    peerId: string;
  }) {
    return this.prisma.remoteConnection.create({
      data: {
        sessionId: data.sessionId,
        organizationId: data.organizationId,
        deviceId: data.deviceId,
        userId: data.userId,
        mode: data.mode as never,
        peerId: data.peerId,
      },
    });
  }

  findById(id: string) {
    return this.prisma.remoteConnection.findUnique({ where: { id } });
  }

  update(id: string, data: Record<string, unknown>) {
    return this.prisma.remoteConnection.update({ where: { id }, data });
  }

  listBySession(sessionId: string) {
    return this.prisma.remoteConnection.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }
}

export class InvitationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: {
    organizationId: string;
    email: string;
    role: UserRole;
    invitedByUserId: string;
    tokenHash: string;
    expiresAt: Date;
  }) {
    return this.prisma.invitation.create({
      data: {
        ...data,
        email: data.email.toLowerCase(),
      },
    });
  }

  findById(id: string) {
    return this.prisma.invitation.findUnique({ where: { id } });
  }

  findByTokenHash(tokenHash: string) {
    return this.prisma.invitation.findUnique({ where: { tokenHash } });
  }

  list(organizationId: string) {
    return this.prisma.invitation.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  update(id: string, data: Record<string, unknown>) {
    return this.prisma.invitation.update({ where: { id }, data });
  }
}

export class ApiKeyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: {
    organizationId: string;
    name: string;
    prefix: string;
    keyHash: string;
    scopes: string[];
    createdByUserId: string;
    expiresAt?: Date | null;
  }) {
    return this.prisma.apiKey.create({ data });
  }

  findById(id: string) {
    return this.prisma.apiKey.findUnique({ where: { id } });
  }

  findByHash(keyHash: string) {
    return this.prisma.apiKey.findUnique({ where: { keyHash } });
  }

  list(organizationId: string) {
    return this.prisma.apiKey.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  update(id: string, data: Record<string, unknown>) {
    return this.prisma.apiKey.update({ where: { id }, data });
  }
}

export class NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: {
    organizationId: string;
    userId: string;
    title: string;
    body: string;
    channel?: string;
    href?: string | null;
    metadata?: object;
  }) {
    return this.prisma.notification.create({
      data: {
        organizationId: data.organizationId,
        userId: data.userId,
        title: data.title,
        body: data.body,
        channel: (data.channel as never) ?? 'in_app',
        href: data.href ?? null,
        metadata: data.metadata ?? {},
      },
    });
  }

  async listForUser(organizationId: string, userId: string, page = 1, pageSize = 20) {
    const where = { organizationId, userId };
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total, page, pageSize, hasMore: page * pageSize < total };
  }

  markRead(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { status: 'read', readAt: new Date() },
    });
  }

  findById(id: string) {
    return this.prisma.notification.findUnique({ where: { id } });
  }
}

export class AuditLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: {
    organizationId: string;
    actorUserId?: string | null;
    actorEmail?: string | null;
    actorIp?: string | null;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    before?: object | null;
    after?: object | null;
    severity?: string;
    requestId?: string | null;
    userAgent?: string | null;
  }) {
    return this.prisma.auditLog.create({
      data: {
        organizationId: data.organizationId,
        actorUserId: data.actorUserId ?? null,
        actorEmail: data.actorEmail ?? null,
        actorIp: data.actorIp ?? null,
        action: data.action,
        resourceType: data.resourceType,
        resourceId: data.resourceId ?? null,
        before: data.before ?? undefined,
        after: data.after ?? undefined,
        severity: (data.severity as never) ?? 'info',
        requestId: data.requestId ?? null,
        userAgent: data.userAgent ?? null,
      },
    });
  }

  async list(organizationId: string, page = 1, pageSize = 20) {
    const where = { organizationId };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, pageSize, hasMore: page * pageSize < total };
  }
}

export class ActivityLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  create(data: {
    organizationId: string;
    actorUserId?: string | null;
    actorType?: string;
    action: string;
    resourceType: string;
    resourceId?: string | null;
    message: string;
    severity?: string;
    metadata?: object;
  }) {
    return this.prisma.activityLog.create({
      data: {
        organizationId: data.organizationId,
        actorUserId: data.actorUserId ?? null,
        actorType: (data.actorType as never) ?? 'user',
        action: data.action,
        resourceType: data.resourceType,
        resourceId: data.resourceId ?? null,
        message: data.message,
        severity: (data.severity as never) ?? 'info',
        metadata: data.metadata ?? {},
      },
    });
  }

  async list(organizationId: string, page = 1, pageSize = 20) {
    const where = { organizationId };
    const [items, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.activityLog.count({ where }),
    ]);
    return { items, total, page, pageSize, hasMore: page * pageSize < total };
  }
}

export class SettingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  getOrgSetting(organizationId: string, key: string) {
    return this.prisma.setting.findUnique({
      where: { organizationId_key: { organizationId, key } },
    });
  }

  upsertOrgSetting(organizationId: string, key: string, value: object) {
    return this.prisma.setting.upsert({
      where: { organizationId_key: { organizationId, key } },
      create: { organizationId, key, value },
      update: { value },
    });
  }

  listOrgSettings(organizationId: string) {
    return this.prisma.setting.findMany({ where: { organizationId } });
  }
}

export class TokenStores {
  constructor(private readonly prisma: PrismaClient) {}

  createEmailVerification(userId: string, tokenHash: string, expiresAt: Date) {
    return this.prisma.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  findEmailVerification(tokenHash: string) {
    return this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
  }

  markEmailVerificationUsed(id: string) {
    return this.prisma.emailVerificationToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  createPasswordReset(userId: string, tokenHash: string, expiresAt: Date) {
    return this.prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  findPasswordReset(tokenHash: string) {
    return this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  }

  markPasswordResetUsed(id: string) {
    return this.prisma.passwordResetToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }

  upsertTwoFactor(userId: string, secretEnc: string, backupCodes: string[]) {
    return this.prisma.twoFactorSecret.upsert({
      where: { userId },
      create: { userId, secretEnc, backupCodes },
      update: { secretEnc, backupCodes, verifiedAt: null },
    });
  }

  getTwoFactor(userId: string) {
    return this.prisma.twoFactorSecret.findUnique({ where: { userId } });
  }

  verifyTwoFactor(userId: string) {
    return this.prisma.twoFactorSecret.update({
      where: { userId },
      data: { verifiedAt: new Date() },
    });
  }

  deleteTwoFactor(userId: string) {
    return this.prisma.twoFactorSecret.delete({ where: { userId } });
  }
}
