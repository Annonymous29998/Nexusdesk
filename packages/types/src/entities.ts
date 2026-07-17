import type {
  ApiKeyStatus,
  DevicePlatform,
  DeviceStatus,
  InvitationStatus,
  LogSeverity,
  NotificationChannel,
  NotificationStatus,
  PermissionAction,
  PermissionResource,
  RemoteConnectionMode,
  SessionStatus,
  UserRole,
} from './enums.js';

/** Branded string IDs for type-safe entity references. */
export type EntityId = string & { readonly __brand: 'EntityId' };

export interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

export interface SoftDelete {
  deletedAt: string | null;
}

export interface Organization extends Timestamps, SoftDelete {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  plan: string;
  settings: OrganizationSettings;
  ownerUserId: string;
  maxDevices: number;
  maxSeats: number;
}

export interface OrganizationSettings {
  defaultConnectionMode: RemoteConnectionMode;
  sessionIdleTimeoutMinutes: number;
  requireMfa: boolean;
  allowViewOnlyGuests: boolean;
  recordingEnabled: boolean;
  ipAllowlist: string[];
  timezone: string;
}

export interface User extends Timestamps, SoftDelete {
  id: string;
  organizationId: string;
  email: string;
  emailVerifiedAt: string | null;
  displayName: string;
  avatarUrl: string | null;
  role: UserRole;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  isActive: boolean;
}

export interface Device extends Timestamps, SoftDelete {
  id: string;
  organizationId: string;
  name: string;
  hostname: string;
  platform: DevicePlatform;
  osVersion: string;
  agentVersion: string;
  status: DeviceStatus;
  lastSeenAt: string | null;
  lastIp: string | null;
  tags: string[];
  metadata: Record<string, string>;
  enrolledByUserId: string | null;
  publicKey: string | null;
}

export interface Session extends Timestamps {
  id: string;
  organizationId: string;
  deviceId: string;
  initiatedByUserId: string;
  status: SessionStatus;
  mode: RemoteConnectionMode;
  startedAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  clientIp: string | null;
  recordingUrl: string | null;
  metadata: Record<string, unknown>;
}

export interface RemoteConnection extends Timestamps {
  id: string;
  sessionId: string;
  organizationId: string;
  deviceId: string;
  userId: string;
  mode: RemoteConnectionMode;
  peerId: string;
  iceConnected: boolean;
  connectedAt: string | null;
  disconnectedAt: string | null;
  bytesSent: number;
  bytesReceived: number;
  latencyMs: number | null;
}

export interface ActivityLog {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  actorType: 'user' | 'agent' | 'system' | 'api_key';
  action: string;
  resourceType: string;
  resourceId: string | null;
  message: string;
  severity: LogSeverity;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  actorEmail: string | null;
  actorIp: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  severity: LogSeverity;
  requestId: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface Invitation extends Timestamps {
  id: string;
  organizationId: string;
  email: string;
  role: UserRole;
  status: InvitationStatus;
  invitedByUserId: string;
  tokenHash: string;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedUserId: string | null;
}

export interface ApiKey extends Timestamps {
  id: string;
  organizationId: string;
  name: string;
  prefix: string;
  keyHash: string;
  status: ApiKeyStatus;
  scopes: string[];
  createdByUserId: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface Notification extends Timestamps {
  id: string;
  organizationId: string;
  userId: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  title: string;
  body: string;
  href: string | null;
  metadata: Record<string, unknown>;
  readAt: string | null;
}

export interface Permission {
  id: string;
  role: UserRole;
  resource: PermissionResource;
  action: PermissionAction;
  description: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
