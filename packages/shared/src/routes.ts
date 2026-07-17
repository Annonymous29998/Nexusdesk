/** HTTP API route path templates (relative to API base). */
export const API_ROUTES = {
  health: '/health',
  ready: '/ready',

  auth: {
    login: '/auth/login',
    logout: '/auth/logout',
    refresh: '/auth/refresh',
    me: '/auth/me',
    forgotPassword: '/auth/forgot-password',
    resetPassword: '/auth/reset-password',
    verifyEmail: '/auth/verify-email',
    mfaSetup: '/auth/mfa/setup',
    mfaVerify: '/auth/mfa/verify',
  },

  organizations: {
    root: '/organizations',
    byId: '/organizations/:orgId',
    settings: '/organizations/:orgId/settings',
  },

  users: {
    root: '/organizations/:orgId/users',
    byId: '/organizations/:orgId/users/:userId',
  },

  invitations: {
    root: '/organizations/:orgId/invitations',
    byId: '/organizations/:orgId/invitations/:invitationId',
    accept: '/invitations/accept',
  },

  guestLinks: {
    root: '/organizations/:orgId/guest-links',
    byId: '/organizations/:orgId/guest-links/:linkId',
    revoke: '/organizations/:orgId/guest-links/:linkId/revoke',
    publicByCode: '/guest/:code',
    windowsInstaller: '/guest/:code/windows.ps1',
    windowsLauncher: '/guest/:code/install.bat',
    windowsGui: '/guest/:code/setup.hta',
    agentPackage: '/guest/:code/agent-package.zip',
  },

  devices: {
    root: '/organizations/:orgId/devices',
    byId: '/organizations/:orgId/devices/:deviceId',
    enroll: '/devices/enroll',
    heartbeat: '/devices/:deviceId/heartbeat',
    commands: '/organizations/:orgId/devices/:deviceId/commands',
  },

  sessions: {
    root: '/organizations/:orgId/sessions',
    byId: '/organizations/:orgId/sessions/:sessionId',
    end: '/organizations/:orgId/sessions/:sessionId/end',
  },

  connections: {
    root: '/organizations/:orgId/sessions/:sessionId/connections',
    byId: '/organizations/:orgId/sessions/:sessionId/connections/:connectionId',
    turn: '/organizations/:orgId/sessions/:sessionId/turn-credentials',
  },

  apiKeys: {
    root: '/organizations/:orgId/api-keys',
    byId: '/organizations/:orgId/api-keys/:keyId',
  },

  notifications: {
    root: '/organizations/:orgId/notifications',
    byId: '/organizations/:orgId/notifications/:notificationId',
    markRead: '/organizations/:orgId/notifications/:notificationId/read',
  },

  audit: {
    root: '/organizations/:orgId/audit-logs',
  },

  activity: {
    root: '/organizations/:orgId/activity',
  },
} as const;

export type ApiRoutes = typeof API_ROUTES;

/** Replace `:param` segments in a route template. */
export function buildApiPath(
  template: string,
  params: Record<string, string>,
): string {
  return template.replace(/:([A-Za-z]+)/g, (_, key: string) => {
    const value = params[key];
    if (value === undefined) {
      throw new Error(`Missing path param: ${key}`);
    }
    return encodeURIComponent(value);
  });
}
