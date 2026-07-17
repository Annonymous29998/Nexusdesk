import type { PrismaClient } from '@prisma/client';
import { AuditLogRepository, ActivityLogRepository } from '../repositories/index.js';

export class AuditService {
  private readonly audit: AuditLogRepository;
  private readonly activity: ActivityLogRepository;

  constructor(prisma: PrismaClient) {
    this.audit = new AuditLogRepository(prisma);
    this.activity = new ActivityLogRepository(prisma);
  }

  record(data: {
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
    return this.audit.create(data);
  }

  list(organizationId: string, page?: number, pageSize?: number) {
    return this.audit.list(organizationId, page, pageSize);
  }

  logActivity(data: {
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
    return this.activity.create(data);
  }

  listActivity(organizationId: string, page?: number, pageSize?: number) {
    return this.activity.list(organizationId, page, pageSize);
  }
}
