import {
  DevicePlatform,
  DeviceStatus,
  LogSeverity,
  NotificationChannel,
  NotificationStatus,
  RemoteConnectionMode,
  SessionStatus,
  UserRole,
  type ActivityLog,
  type AuditLog,
  type Device,
  type Notification,
  type Organization,
  type Session,
  type User,
} from '@nexusdesk/types';
import { DEFAULT_ORGANIZATION_SETTINGS } from '@nexusdesk/shared';

const now = () => new Date().toISOString();
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();

export const MOCK_ORG_ID = 'org_demo_acme';
export const MOCK_USER_ID = 'usr_demo_admin';

export const mockOrganization: Organization = {
  id: MOCK_ORG_ID,
  name: 'Acme Operations',
  slug: 'acme',
  logoUrl: null,
  plan: 'business',
  settings: { ...DEFAULT_ORGANIZATION_SETTINGS },
  ownerUserId: MOCK_USER_ID,
  maxDevices: 100,
  maxSeats: 25,
  createdAt: daysAgo(120),
  updatedAt: hoursAgo(2),
  deletedAt: null,
};

export const mockOrganizations: Organization[] = [
  mockOrganization,
  {
    id: 'org_demo_northstar',
    name: 'Northstar Labs',
    slug: 'northstar',
    logoUrl: null,
    plan: 'starter',
    settings: { ...DEFAULT_ORGANIZATION_SETTINGS, recordingEnabled: false },
    ownerUserId: MOCK_USER_ID,
    maxDevices: 20,
    maxSeats: 5,
    createdAt: daysAgo(45),
    updatedAt: daysAgo(1),
    deletedAt: null,
  },
];

export const mockUser: User = {
  id: MOCK_USER_ID,
  organizationId: MOCK_ORG_ID,
  email: 'admin@acme.demo',
  emailVerifiedAt: daysAgo(100),
  displayName: 'Alex Rivera',
  avatarUrl: null,
  role: UserRole.Owner,
  mfaEnabled: false,
  lastLoginAt: hoursAgo(0.1),
  lastLoginIp: '203.0.113.42',
  isActive: true,
  createdAt: daysAgo(120),
  updatedAt: hoursAgo(0.1),
  deletedAt: null,
};

export const mockUsers: User[] = [
  mockUser,
  {
    id: 'usr_demo_ops',
    organizationId: MOCK_ORG_ID,
    email: 'ops@acme.demo',
    emailVerifiedAt: daysAgo(60),
    displayName: 'Jordan Lee',
    avatarUrl: null,
    role: UserRole.Operator,
    mfaEnabled: true,
    lastLoginAt: hoursAgo(5),
    lastLoginIp: '198.51.100.17',
    isActive: true,
    createdAt: daysAgo(60),
    updatedAt: hoursAgo(5),
    deletedAt: null,
  },
  {
    id: 'usr_demo_viewer',
    organizationId: MOCK_ORG_ID,
    email: 'viewer@acme.demo',
    emailVerifiedAt: daysAgo(30),
    displayName: 'Sam Chen',
    avatarUrl: null,
    role: UserRole.Viewer,
    mfaEnabled: false,
    lastLoginAt: daysAgo(2),
    lastLoginIp: '192.0.2.88',
    isActive: true,
    createdAt: daysAgo(30),
    updatedAt: daysAgo(2),
    deletedAt: null,
  },
  {
    id: 'usr_demo_admin2',
    organizationId: MOCK_ORG_ID,
    email: 'it@acme.demo',
    emailVerifiedAt: daysAgo(90),
    displayName: 'Taylor Brooks',
    avatarUrl: null,
    role: UserRole.Admin,
    mfaEnabled: true,
    lastLoginAt: hoursAgo(12),
    lastLoginIp: '203.0.113.9',
    isActive: false,
    createdAt: daysAgo(90),
    updatedAt: daysAgo(3),
    deletedAt: null,
  },
];

export const mockDevices: Device[] = [
  {
    id: 'dev_win_hq_01',
    organizationId: MOCK_ORG_ID,
    name: 'HQ Front Desk',
    hostname: 'WIN-FRONT-01',
    platform: DevicePlatform.Windows,
    osVersion: 'Windows 11 Pro 23H2',
    agentVersion: '1.4.2',
    status: DeviceStatus.Online,
    lastSeenAt: hoursAgo(0.02),
    lastIp: '10.0.1.41',
    tags: ['hq', 'public'],
    metadata: { location: 'Lobby' },
    enrolledByUserId: MOCK_USER_ID,
    publicKey: null,
    createdAt: daysAgo(40),
    updatedAt: hoursAgo(0.02),
    deletedAt: null,
  },
  {
    id: 'dev_mac_design_02',
    organizationId: MOCK_ORG_ID,
    name: 'Design Studio Mac',
    hostname: 'MacBook-Pro-Design',
    platform: DevicePlatform.MacOS,
    osVersion: 'macOS 15.2',
    agentVersion: '1.4.2',
    status: DeviceStatus.Online,
    lastSeenAt: hoursAgo(0.05),
    lastIp: '10.0.2.18',
    tags: ['design', 'creative'],
    metadata: { location: 'Floor 3' },
    enrolledByUserId: MOCK_USER_ID,
    publicKey: null,
    createdAt: daysAgo(28),
    updatedAt: hoursAgo(0.05),
    deletedAt: null,
  },
  {
    id: 'dev_linux_ci_03',
    organizationId: MOCK_ORG_ID,
    name: 'CI Runner Alpha',
    hostname: 'ci-alpha-01',
    platform: DevicePlatform.Linux,
    osVersion: 'Ubuntu 24.04 LTS',
    agentVersion: '1.4.1',
    status: DeviceStatus.Offline,
    lastSeenAt: hoursAgo(18),
    lastIp: '10.0.3.7',
    tags: ['ci', 'infra'],
    metadata: { location: 'Rack A' },
    enrolledByUserId: 'usr_demo_ops',
    publicKey: null,
    createdAt: daysAgo(55),
    updatedAt: hoursAgo(18),
    deletedAt: null,
  },
  {
    id: 'dev_win_warehouse_04',
    organizationId: MOCK_ORG_ID,
    name: 'Warehouse Terminal',
    hostname: 'WH-TERM-04',
    platform: DevicePlatform.Windows,
    osVersion: 'Windows 10 IoT',
    agentVersion: '1.3.9',
    status: DeviceStatus.Updating,
    lastSeenAt: hoursAgo(0.5),
    lastIp: '10.0.4.22',
    tags: ['warehouse'],
    metadata: { location: 'Dock 2' },
    enrolledByUserId: 'usr_demo_ops',
    publicKey: null,
    createdAt: daysAgo(70),
    updatedAt: hoursAgo(0.5),
    deletedAt: null,
  },
  {
    id: 'dev_pending_05',
    organizationId: MOCK_ORG_ID,
    name: 'New Enrollment',
    hostname: 'UNKNOWN',
    platform: DevicePlatform.Unknown,
    osVersion: '—',
    agentVersion: '1.4.2',
    status: DeviceStatus.Pending,
    lastSeenAt: hoursAgo(1),
    lastIp: '203.0.113.200',
    tags: [],
    metadata: {},
    enrolledByUserId: null,
    publicKey: null,
    createdAt: hoursAgo(1),
    updatedAt: hoursAgo(1),
    deletedAt: null,
  },
  {
    id: 'dev_error_06',
    organizationId: MOCK_ORG_ID,
    name: 'Branch Kiosk',
    hostname: 'KIOSK-B2',
    platform: DevicePlatform.Linux,
    osVersion: 'Debian 12',
    agentVersion: '1.2.0',
    status: DeviceStatus.Error,
    lastSeenAt: daysAgo(1),
    lastIp: '10.1.8.55',
    tags: ['kiosk', 'branch'],
    metadata: { error: 'agent_crash_loop' },
    enrolledByUserId: MOCK_USER_ID,
    publicKey: null,
    createdAt: daysAgo(100),
    updatedAt: daysAgo(1),
    deletedAt: null,
  },
];

export const mockSessions: Session[] = [
  {
    id: 'ses_active_01',
    organizationId: MOCK_ORG_ID,
    deviceId: 'dev_win_hq_01',
    initiatedByUserId: MOCK_USER_ID,
    status: SessionStatus.Active,
    mode: RemoteConnectionMode.Control,
    startedAt: hoursAgo(0.4),
    endedAt: null,
    endReason: null,
    clientIp: '203.0.113.42',
    recordingUrl: null,
    metadata: {},
    createdAt: hoursAgo(0.4),
    updatedAt: hoursAgo(0.05),
  },
  {
    id: 'ses_ended_02',
    organizationId: MOCK_ORG_ID,
    deviceId: 'dev_mac_design_02',
    initiatedByUserId: 'usr_demo_ops',
    status: SessionStatus.Ended,
    mode: RemoteConnectionMode.ViewOnly,
    startedAt: daysAgo(1),
    endedAt: hoursAgo(20),
    endReason: 'user_hangup',
    clientIp: '198.51.100.17',
    recordingUrl: 'https://recordings.demo/ses_ended_02.mp4',
    metadata: {},
    createdAt: daysAgo(1),
    updatedAt: hoursAgo(20),
  },
  {
    id: 'ses_failed_03',
    organizationId: MOCK_ORG_ID,
    deviceId: 'dev_linux_ci_03',
    initiatedByUserId: MOCK_USER_ID,
    status: SessionStatus.Failed,
    mode: RemoteConnectionMode.Control,
    startedAt: daysAgo(2),
    endedAt: daysAgo(2),
    endReason: 'device_offline',
    clientIp: '203.0.113.42',
    recordingUrl: null,
    metadata: {},
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
  },
  {
    id: 'ses_ended_04',
    organizationId: MOCK_ORG_ID,
    deviceId: 'dev_win_warehouse_04',
    initiatedByUserId: 'usr_demo_admin2',
    status: SessionStatus.TimedOut,
    mode: RemoteConnectionMode.Control,
    startedAt: daysAgo(3),
    endedAt: daysAgo(3),
    endReason: 'idle_timeout',
    clientIp: '203.0.113.9',
    recordingUrl: null,
    metadata: {},
    createdAt: daysAgo(3),
    updatedAt: daysAgo(3),
  },
];

export const mockActivity: ActivityLog[] = [
  {
    id: 'act_01',
    organizationId: MOCK_ORG_ID,
    actorUserId: MOCK_USER_ID,
    actorType: 'user',
    action: 'session.started',
    resourceType: 'session',
    resourceId: 'ses_active_01',
    message: 'Alex Rivera started a control session on HQ Front Desk',
    severity: LogSeverity.Info,
    metadata: { mode: 'control' },
    createdAt: hoursAgo(0.4),
  },
  {
    id: 'act_02',
    organizationId: MOCK_ORG_ID,
    actorUserId: null,
    actorType: 'agent',
    action: 'device.heartbeat',
    resourceType: 'device',
    resourceId: 'dev_mac_design_02',
    message: 'Design Studio Mac reported healthy heartbeat',
    severity: LogSeverity.Debug,
    metadata: {},
    createdAt: hoursAgo(0.05),
  },
  {
    id: 'act_03',
    organizationId: MOCK_ORG_ID,
    actorUserId: 'usr_demo_ops',
    actorType: 'user',
    action: 'device.tagged',
    resourceType: 'device',
    resourceId: 'dev_linux_ci_03',
    message: 'Jordan Lee updated tags on CI Runner Alpha',
    severity: LogSeverity.Info,
    metadata: { tags: ['ci', 'infra'] },
    createdAt: hoursAgo(6),
  },
  {
    id: 'act_04',
    organizationId: MOCK_ORG_ID,
    actorUserId: null,
    actorType: 'system',
    action: 'device.error',
    resourceType: 'device',
    resourceId: 'dev_error_06',
    message: 'Branch Kiosk entered error state: agent_crash_loop',
    severity: LogSeverity.Error,
    metadata: { error: 'agent_crash_loop' },
    createdAt: daysAgo(1),
  },
];

export const mockAudit: AuditLog[] = [
  {
    id: 'aud_01',
    organizationId: MOCK_ORG_ID,
    actorUserId: MOCK_USER_ID,
    actorEmail: 'admin@acme.demo',
    actorIp: '203.0.113.42',
    action: 'user.role_changed',
    resourceType: 'user',
    resourceId: 'usr_demo_viewer',
    before: { role: 'operator' },
    after: { role: 'viewer' },
    severity: LogSeverity.Warn,
    requestId: 'req_abc123',
    userAgent: 'Mozilla/5.0',
    createdAt: daysAgo(4),
  },
  {
    id: 'aud_02',
    organizationId: MOCK_ORG_ID,
    actorUserId: MOCK_USER_ID,
    actorEmail: 'admin@acme.demo',
    actorIp: '203.0.113.42',
    action: 'org.settings_updated',
    resourceType: 'organization',
    resourceId: MOCK_ORG_ID,
    before: { requireMfa: false },
    after: { requireMfa: false, sessionIdleTimeoutMinutes: 30 },
    severity: LogSeverity.Info,
    requestId: 'req_def456',
    userAgent: 'Mozilla/5.0',
    createdAt: daysAgo(7),
  },
  {
    id: 'aud_03',
    organizationId: MOCK_ORG_ID,
    actorUserId: 'usr_demo_admin2',
    actorEmail: 'it@acme.demo',
    actorIp: '203.0.113.9',
    action: 'user.disabled',
    resourceType: 'user',
    resourceId: 'usr_demo_admin2',
    before: { isActive: true },
    after: { isActive: false },
    severity: LogSeverity.Warn,
    requestId: 'req_ghi789',
    userAgent: 'Mozilla/5.0',
    createdAt: daysAgo(3),
  },
];

export const mockNotifications: Notification[] = [
  {
    id: 'ntf_01',
    organizationId: MOCK_ORG_ID,
    userId: MOCK_USER_ID,
    channel: NotificationChannel.InApp,
    status: NotificationStatus.Unread,
    title: 'Device offline',
    body: 'CI Runner Alpha has been offline for 18 hours.',
    href: '/devices/dev_linux_ci_03',
    metadata: {},
    readAt: null,
    createdAt: hoursAgo(2),
    updatedAt: hoursAgo(2),
  },
  {
    id: 'ntf_02',
    organizationId: MOCK_ORG_ID,
    userId: MOCK_USER_ID,
    channel: NotificationChannel.InApp,
    status: NotificationStatus.Unread,
    title: 'Agent update available',
    body: 'Warehouse Terminal can upgrade from 1.3.9 to 1.4.2.',
    href: '/devices/dev_win_warehouse_04',
    metadata: {},
    readAt: null,
    createdAt: hoursAgo(5),
    updatedAt: hoursAgo(5),
  },
  {
    id: 'ntf_03',
    organizationId: MOCK_ORG_ID,
    userId: MOCK_USER_ID,
    channel: NotificationChannel.InApp,
    status: NotificationStatus.Read,
    title: 'Session recording ready',
    body: 'Recording for Design Studio Mac session is available.',
    href: '/sessions',
    metadata: {},
    readAt: hoursAgo(12),
    createdAt: hoursAgo(20),
    updatedAt: hoursAgo(12),
  },
];

export interface AnalyticsOverview {
  devicesOnline: number;
  devicesTotal: number;
  activeSessions: number;
  sessionsToday: number;
  avgSessionMinutes: number;
  usersActive: number;
  series: {
    date: string;
    sessions: number;
    devicesOnline: number;
    bytesGb: number;
  }[];
  byPlatform: { platform: string; count: number }[];
  byStatus: { status: string; count: number }[];
}

export function buildAnalyticsOverview(devices = mockDevices, sessions = mockSessions): AnalyticsOverview {
  const online = devices.filter((d) => d.status === DeviceStatus.Online).length;
  const active = sessions.filter((s) => s.status === SessionStatus.Active).length;
  const series = Array.from({ length: 14 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (13 - i));
    return {
      date: date.toISOString().slice(0, 10),
      sessions: 4 + ((i * 3) % 9) + (i % 2),
      devicesOnline: Math.max(1, online - (i % 3) + 1),
      bytesGb: Number((1.2 + (i % 5) * 0.7).toFixed(1)),
    };
  });

  const byPlatform = Object.values(DevicePlatform).map((platform) => ({
    platform,
    count: devices.filter((d) => d.platform === platform).length,
  })).filter((x) => x.count > 0);

  const byStatus = Object.values(DeviceStatus).map((status) => ({
    status,
    count: devices.filter((d) => d.status === status).length,
  })).filter((x) => x.count > 0);

  return {
    devicesOnline: online,
    devicesTotal: devices.length,
    activeSessions: active,
    sessionsToday: sessions.filter((s) => s.createdAt >= hoursAgo(24)).length + 6,
    avgSessionMinutes: 28,
    usersActive: mockUsers.filter((u) => u.isActive).length,
    series,
    byPlatform,
    byStatus,
  };
}

export function createMockTokens() {
  const accessExpires = new Date(Date.now() + 15 * 60_000).toISOString();
  const refreshExpires = new Date(Date.now() + 7 * 86400_000).toISOString();
  return {
    accessToken: `demo_access_${Date.now()}`,
    refreshToken: `demo_refresh_${Date.now()}`,
    accessExpiresAt: accessExpires,
    refreshExpiresAt: refreshExpires,
    tokenType: 'Bearer' as const,
  };
}

export function nowIso() {
  return now();
}
