import {
  PermissionAction,
  PermissionResource,
  RemoteConnectionMode,
  UserRole,
} from '@nexusdesk/types';

export const ALL_ROLES: readonly UserRole[] = [
  UserRole.Owner,
  UserRole.Admin,
  UserRole.Operator,
  UserRole.Viewer,
  UserRole.Agent,
] as const;

export const HUMAN_ROLES: readonly UserRole[] = [
  UserRole.Owner,
  UserRole.Admin,
  UserRole.Operator,
  UserRole.Viewer,
] as const;

export const ROLE_RANK: Record<UserRole, number> = {
  [UserRole.Owner]: 100,
  [UserRole.Admin]: 80,
  [UserRole.Operator]: 50,
  [UserRole.Viewer]: 20,
  [UserRole.Agent]: 10,
};

export function roleAtLeast(role: UserRole, minimum: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

type PermissionKey = `${PermissionResource}:${PermissionAction}`;

const ALL_ACTIONS = Object.values(PermissionAction);
const ALL_RESOURCES = Object.values(PermissionResource);

function keysFor(
  resources: PermissionResource[],
  actions: PermissionAction[],
): PermissionKey[] {
  const keys: PermissionKey[] = [];
  for (const resource of resources) {
    for (const action of actions) {
      keys.push(`${resource}:${action}`);
    }
  }
  return keys;
}

/** Role → granted permission keys (resource:action). */
export const PERMISSIONS_MATRIX: Record<UserRole, readonly PermissionKey[]> = {
  [UserRole.Owner]: keysFor(ALL_RESOURCES, ALL_ACTIONS),

  [UserRole.Admin]: [
    ...keysFor(
      [
        PermissionResource.User,
        PermissionResource.Device,
        PermissionResource.Session,
        PermissionResource.RemoteConnection,
        PermissionResource.Invitation,
        PermissionResource.ApiKey,
        PermissionResource.Settings,
      ],
      ALL_ACTIONS,
    ),
    `${PermissionResource.Organization}:${PermissionAction.Read}`,
    `${PermissionResource.Organization}:${PermissionAction.Update}`,
    `${PermissionResource.AuditLog}:${PermissionAction.Read}`,
    `${PermissionResource.AuditLog}:${PermissionAction.Audit}`,
    `${PermissionResource.Billing}:${PermissionAction.Read}`,
  ],

  [UserRole.Operator]: [
    `${PermissionResource.Device}:${PermissionAction.Read}`,
    `${PermissionResource.Device}:${PermissionAction.Control}`,
    `${PermissionResource.Device}:${PermissionAction.View}`,
    `${PermissionResource.Session}:${PermissionAction.Create}`,
    `${PermissionResource.Session}:${PermissionAction.Read}`,
    `${PermissionResource.Session}:${PermissionAction.Update}`,
    `${PermissionResource.RemoteConnection}:${PermissionAction.Create}`,
    `${PermissionResource.RemoteConnection}:${PermissionAction.Read}`,
    `${PermissionResource.RemoteConnection}:${PermissionAction.Control}`,
    `${PermissionResource.RemoteConnection}:${PermissionAction.View}`,
    `${PermissionResource.User}:${PermissionAction.Read}`,
  ],

  [UserRole.Viewer]: [
    `${PermissionResource.Device}:${PermissionAction.Read}`,
    `${PermissionResource.Device}:${PermissionAction.View}`,
    `${PermissionResource.Session}:${PermissionAction.Read}`,
    `${PermissionResource.RemoteConnection}:${PermissionAction.Read}`,
    `${PermissionResource.RemoteConnection}:${PermissionAction.View}`,
    `${PermissionResource.User}:${PermissionAction.Read}`,
  ],

  [UserRole.Agent]: [
    `${PermissionResource.Device}:${PermissionAction.Update}`,
    `${PermissionResource.Session}:${PermissionAction.Read}`,
    `${PermissionResource.Session}:${PermissionAction.Update}`,
    `${PermissionResource.RemoteConnection}:${PermissionAction.Update}`,
  ],
};

export function hasPermission(
  role: UserRole,
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  const key: PermissionKey = `${resource}:${action}`;
  return PERMISSIONS_MATRIX[role].includes(key);
}

export const DEFAULT_ORGANIZATION_SETTINGS = {
  defaultConnectionMode: RemoteConnectionMode.Control,
  sessionIdleTimeoutMinutes: 30,
  requireMfa: false,
  allowViewOnlyGuests: false,
  recordingEnabled: true,
  ipAllowlist: [] as string[],
  timezone: 'UTC',
} as const;

export const DEFAULT_AGENT_SETTINGS = {
  heartbeatIntervalMs: 30_000,
  offlineThresholdMs: 90_000,
  maxConcurrentSessions: 5,
  allowControl: true,
  allowViewOnly: true,
  recordingEnabled: true,
  logLevel: 'info' as const,
};

export const DEFAULT_PAGINATION = {
  page: 1,
  pageSize: 20,
  maxPageSize: 100,
} as const;

export const TOKEN_DEFAULTS = {
  accessTtl: '15m',
  refreshTtl: '7d',
  agentTtl: '24h',
  invitationTtl: '7d',
  apiKeyPrefixLength: 8,
} as const;
