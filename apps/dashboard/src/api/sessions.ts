import { API_ROUTES, buildApiPath } from '@nexusdesk/shared';
import {
  RemoteConnectionMode,
  SessionStatus,
  type Paginated,
  type Session,
} from '@nexusdesk/types';
import { apiRequest, delay, withDemoFallback } from '@/api/client';
import { mockSessions, nowIso } from '@/lib/mock-data';

export interface SessionListParams {
  orgId: string;
  page?: number;
  pageSize?: number;
  status?: string;
  deviceId?: string;
}

export interface StartSessionRequest {
  deviceId: string;
  mode?: RemoteConnectionMode;
}

function filterSessions(params: SessionListParams): Paginated<Session> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  let items = [...mockSessions];
  if (params.status) items = items.filter((s) => s.status === params.status);
  if (params.deviceId) items = items.filter((s) => s.deviceId === params.deviceId);
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const start = (page - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    items: slice,
    total: items.length,
    page,
    pageSize,
    hasMore: start + pageSize < items.length,
  };
}

export async function listSessions(params: SessionListParams): Promise<Paginated<Session>> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.status) query.set('status', params.status);
  if (params.deviceId) query.set('deviceId', params.deviceId);
  const qs = query.toString();
  const path =
    buildApiPath(API_ROUTES.sessions.root, { orgId: params.orgId }) + (qs ? `?${qs}` : '');

  return withDemoFallback(
    () => apiRequest<Paginated<Session>>(path),
    async () => {
      await delay();
      return filterSessions(params);
    },
  );
}

export async function getSession(orgId: string, sessionId: string): Promise<Session> {
  const path = buildApiPath(API_ROUTES.sessions.byId, { orgId, sessionId });
  return withDemoFallback(
    () => apiRequest<Session>(path),
    async () => {
      await delay();
      const session = mockSessions.find((s) => s.id === sessionId);
      if (!session) throw new Error('Session not found');
      return session;
    },
  );
}

export async function startSession(
  orgId: string,
  payload: StartSessionRequest,
  userId: string,
): Promise<Session> {
  const path = buildApiPath(API_ROUTES.sessions.root, { orgId });
  return withDemoFallback(
    () => apiRequest<Session>(path, { method: 'POST', body: payload }),
    async () => {
      await delay(250);
      const session: Session = {
        id: `ses_${Date.now()}`,
        organizationId: orgId,
        deviceId: payload.deviceId,
        initiatedByUserId: userId,
        status: SessionStatus.Connecting,
        mode: payload.mode ?? RemoteConnectionMode.Control,
        startedAt: nowIso(),
        endedAt: null,
        endReason: null,
        clientIp: '127.0.0.1',
        recordingUrl: null,
        metadata: {},
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      mockSessions.unshift(session);
      setTimeout(() => {
        session.status = SessionStatus.Active;
        session.updatedAt = nowIso();
      }, 800);
      return session;
    },
  );
}

export async function endSession(orgId: string, sessionId: string): Promise<Session> {
  const path = buildApiPath(API_ROUTES.sessions.end, { orgId, sessionId });
  return withDemoFallback(
    () => apiRequest<Session>(path, { method: 'POST', body: {} }),
    async () => {
      await delay();
      const session = mockSessions.find((s) => s.id === sessionId);
      if (!session) throw new Error('Session not found');
      session.status = SessionStatus.Ended;
      session.endedAt = nowIso();
      session.endReason = 'user_hangup';
      session.updatedAt = nowIso();
      return session;
    },
  );
}
