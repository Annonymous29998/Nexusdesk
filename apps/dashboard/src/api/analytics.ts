import { API_ROUTES, buildApiPath } from '@nexusdesk/shared';
import type { ActivityLog, AuditLog, Notification, Paginated } from '@nexusdesk/types';
import { NotificationStatus } from '@nexusdesk/types';
import { apiRequest, delay, withDemoFallback, ApiClientError } from '@/api/client';
import {
  buildAnalyticsOverview,
  mockActivity,
  mockAudit,
  mockNotifications,
  nowIso,
  type AnalyticsOverview,
} from '@/lib/mock-data';

export async function listActivity(
  orgId: string,
  page = 1,
  pageSize = 50,
): Promise<Paginated<ActivityLog>> {
  const path =
    buildApiPath(API_ROUTES.activity.root, { orgId }) + `?page=${page}&pageSize=${pageSize}`;
  return withDemoFallback(
    () => apiRequest<Paginated<ActivityLog>>(path),
    async () => {
      await delay();
      const start = (page - 1) * pageSize;
      const items = mockActivity.slice(start, start + pageSize);
      return {
        items,
        total: mockActivity.length,
        page,
        pageSize,
        hasMore: start + pageSize < mockActivity.length,
      };
    },
  );
}

export async function listAuditLogs(
  orgId: string,
  page = 1,
  pageSize = 50,
): Promise<Paginated<AuditLog>> {
  const path =
    buildApiPath(API_ROUTES.audit.root, { orgId }) + `?page=${page}&pageSize=${pageSize}`;
  return withDemoFallback(
    () => apiRequest<Paginated<AuditLog>>(path),
    async () => {
      await delay();
      const start = (page - 1) * pageSize;
      const items = mockAudit.slice(start, start + pageSize);
      return {
        items,
        total: mockAudit.length,
        page,
        pageSize,
        hasMore: start + pageSize < mockAudit.length,
      };
    },
  );
}

export async function listNotifications(orgId: string): Promise<Notification[]> {
  const path = buildApiPath(API_ROUTES.notifications.root, { orgId });
  return withDemoFallback(
    () => apiRequest<Notification[] | Paginated<Notification>>(path).then((res) =>
      Array.isArray(res) ? res : res.items,
    ),
    async () => {
      await delay();
      return [...mockNotifications];
    },
  );
}

export async function markNotificationRead(
  orgId: string,
  notificationId: string,
): Promise<Notification> {
  const path = buildApiPath(API_ROUTES.notifications.markRead, { orgId, notificationId });
  return withDemoFallback(
    () => apiRequest<Notification>(path, { method: 'POST', body: {} }),
    async () => {
      await delay(80);
      const ntf = mockNotifications.find((n) => n.id === notificationId);
      if (!ntf) throw new Error('Notification not found');
      ntf.status = NotificationStatus.Read;
      ntf.readAt = nowIso();
      ntf.updatedAt = nowIso();
      return ntf;
    },
  );
}

export async function markAllNotificationsRead(orgId: string): Promise<void> {
  const path = buildApiPath(API_ROUTES.notifications.root, { orgId }) + '/read-all';
  return withDemoFallback(
    () => apiRequest<void>(path, { method: 'POST', body: {} }),
    async () => {
      await delay(80);
      for (const n of mockNotifications) {
        if (n.status === NotificationStatus.Unread) {
          n.status = NotificationStatus.Read;
          n.readAt = nowIso();
          n.updatedAt = nowIso();
        }
      }
    },
  );
}

export async function fetchAnalytics(orgId: string): Promise<AnalyticsOverview> {
  const paths = [
    `/organizations/${orgId}/analytics/overview`,
    `/organizations/${orgId}/analytics/summary`,
    `/organizations/${orgId}/analytics`,
  ];

  const normalize = (
    raw: AnalyticsOverview & {
      devices?: { total: number; online: number };
      sessions?: { active: number; today?: number; averageDurationMs?: number };
      members?: number;
    },
  ): AnalyticsOverview => ({
    devicesOnline: raw.devicesOnline ?? raw.devices?.online ?? 0,
    devicesTotal: raw.devicesTotal ?? raw.devices?.total ?? 0,
    activeSessions: raw.activeSessions ?? raw.sessions?.active ?? 0,
    sessionsToday: raw.sessionsToday ?? raw.sessions?.today ?? 0,
    avgSessionMinutes:
      raw.avgSessionMinutes ??
      (raw.sessions?.averageDurationMs
        ? Math.round(raw.sessions.averageDurationMs / 60_000)
        : 0),
    usersActive: raw.usersActive ?? raw.members ?? 0,
    series: raw.series ?? [],
    byPlatform: raw.byPlatform ?? [],
    byStatus: raw.byStatus ?? [],
  });

  return withDemoFallback(
    async () => {
      let lastError: unknown;
      for (const path of paths) {
        try {
          const raw = await apiRequest<
            AnalyticsOverview & {
              devices?: { total: number; online: number };
              sessions?: { active: number; today?: number; averageDurationMs?: number };
              members?: number;
            }
          >(path);
          return normalize(raw);
        } catch (error) {
          lastError = error;
          if (error instanceof ApiClientError && error.status === 404) continue;
          throw error;
        }
      }
      throw lastError instanceof Error ? lastError : new Error('Analytics unavailable');
    },
    async () => {
      await delay();
      return buildAnalyticsOverview();
    },
  );
}
