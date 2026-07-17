import type { RemoteConnectionMode, SessionStatus, UserRole } from '@nexusdesk/types';

export interface AuthUserContext {
  userId: string;
  email: string;
  organizationId: string;
  role: UserRole;
  sessionId?: string;
  jti: string;
}

export interface AgentContext {
  deviceId: string;
  organizationId: string;
  jti: string;
}

export interface RemoteSessionState {
  id: string;
  organizationId: string;
  deviceId: string;
  initiatedByUserId: string;
  status: SessionStatus;
  mode: RemoteConnectionMode;
  startedAt: Date | null;
  endedAt: Date | null;
  notes: string | null;
  recordingEnabled: boolean;
  connectionCount: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
