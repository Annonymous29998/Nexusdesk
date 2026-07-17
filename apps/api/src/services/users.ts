import type { PrismaClient } from '@prisma/client';
import { ERROR_CODES } from '@nexusdesk/shared';
import type { UserRole } from '@nexusdesk/types';
import { AppError } from '../domain/errors/app-error.js';
import { OrganizationRepository, UserRepository } from '../repositories/index.js';
import { AuditService } from './audit.js';

export class UsersService {
  private readonly users: UserRepository;
  private readonly orgs: OrganizationRepository;
  private readonly audit: AuditService;

  constructor(prisma: PrismaClient) {
    this.users = new UserRepository(prisma);
    this.orgs = new OrganizationRepository(prisma);
    this.audit = new AuditService(prisma);
  }

  list(organizationId: string, page?: number, pageSize?: number) {
    return this.users.listByOrganization(organizationId, page, pageSize);
  }

  async get(organizationId: string, userId: string) {
    const membership = await this.orgs.findMembership(organizationId, userId);
    if (!membership) throw AppError.notFound('User not found', ERROR_CODES.USER_NOT_FOUND);
    const user = await this.users.findById(userId);
    if (!user) throw AppError.notFound('User not found', ERROR_CODES.USER_NOT_FOUND);
    return { ...user, role: membership.role };
  }

  async update(
    organizationId: string,
    userId: string,
    actorUserId: string,
    data: { displayName?: string; isActive?: boolean; role?: UserRole },
  ) {
    const membership = await this.orgs.findMembership(organizationId, userId);
    if (!membership) throw AppError.notFound('User not found', ERROR_CODES.USER_NOT_FOUND);

    if (data.displayName !== undefined || data.isActive !== undefined) {
      await this.users.update(userId, {
        ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      });
    }
    if (data.role !== undefined) {
      await this.orgs.updateMemberRole(organizationId, userId, data.role);
    }

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'user.update',
      resourceType: 'user',
      resourceId: userId,
      after: data,
    });

    return this.get(organizationId, userId);
  }

  async remove(organizationId: string, userId: string, actorUserId: string) {
    const org = await this.orgs.findById(organizationId);
    if (!org) throw AppError.notFound('Organization not found', ERROR_CODES.ORG_NOT_FOUND);
    if (org.ownerUserId === userId) {
      throw AppError.badRequest('Cannot remove organization owner');
    }
    await this.orgs.removeMember(organizationId, userId);
    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'user.remove',
      resourceType: 'user',
      resourceId: userId,
    });
    return { ok: true };
  }
}

export class OrganizationsService {
  private readonly orgs: OrganizationRepository;
  private readonly audit: AuditService;

  constructor(private readonly prisma: PrismaClient) {
    this.orgs = new OrganizationRepository(prisma);
    this.audit = new AuditService(prisma);
  }

  async get(organizationId: string) {
    const org = await this.orgs.findById(organizationId);
    if (!org) throw AppError.notFound('Organization not found', ERROR_CODES.ORG_NOT_FOUND);
    return org;
  }

  /** List all organizations the given user belongs to (via memberships). */
  async listForUser(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId, organization: { deletedAt: null } },
      include: { organization: true },
      orderBy: { joinedAt: 'asc' },
    });
    return memberships.map((m) => m.organization);
  }

  async update(
    organizationId: string,
    actorUserId: string,
    data: { name?: string; logoUrl?: string | null; settings?: object },
  ) {
    const before = await this.get(organizationId);
    const updated = await this.orgs.update(organizationId, data);
    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'organization.update',
      resourceType: 'organization',
      resourceId: organizationId,
      before: { name: before.name, settings: before.settings },
      after: data,
    });
    return updated;
  }

  listMembers(organizationId: string) {
    return this.orgs.listMembers(organizationId);
  }
}
