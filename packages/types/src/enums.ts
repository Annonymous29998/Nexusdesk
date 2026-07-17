/** User roles within an organization. */
export enum UserRole {
  Owner = 'owner',
  Admin = 'admin',
  Operator = 'operator',
  Viewer = 'viewer',
  Agent = 'agent',
}

/** Lifecycle status of a managed device / agent host. */
export enum DeviceStatus {
  Online = 'online',
  Offline = 'offline',
  Pending = 'pending',
  Disabled = 'disabled',
  Updating = 'updating',
  Error = 'error',
}

/** Lifecycle status of a remote desktop session. */
export enum SessionStatus {
  Pending = 'pending',
  Connecting = 'connecting',
  Active = 'active',
  Paused = 'paused',
  Ending = 'ending',
  Ended = 'ended',
  Failed = 'failed',
  TimedOut = 'timed_out',
}

/** Remote connection interaction mode. */
export enum RemoteConnectionMode {
  Control = 'control',
  ViewOnly = 'view_only',
}

/** Invitation lifecycle. */
export enum InvitationStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  Declined = 'declined',
  Expired = 'expired',
  Revoked = 'revoked',
}

/** Notification delivery channel. */
export enum NotificationChannel {
  InApp = 'in_app',
  Email = 'email',
  Push = 'push',
  Webhook = 'webhook',
}

/** Notification read state. */
export enum NotificationStatus {
  Unread = 'unread',
  Read = 'read',
  Archived = 'archived',
}

/** Activity vs audit distinction for event streams. */
export enum LogSeverity {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
  Critical = 'critical',
}

/** Permission actions that can be granted. */
export enum PermissionAction {
  Create = 'create',
  Read = 'read',
  Update = 'update',
  Delete = 'delete',
  Control = 'control',
  View = 'view',
  Invite = 'invite',
  Manage = 'manage',
  Audit = 'audit',
}

/** Resource scopes for permissions. */
export enum PermissionResource {
  Organization = 'organization',
  User = 'user',
  Device = 'device',
  Session = 'session',
  RemoteConnection = 'remote_connection',
  Invitation = 'invitation',
  ApiKey = 'api_key',
  AuditLog = 'audit_log',
  Settings = 'settings',
  Billing = 'billing',
}

/** Agent-reported platform. */
export enum DevicePlatform {
  Windows = 'windows',
  MacOS = 'macos',
  Linux = 'linux',
  Unknown = 'unknown',
}

/** WebRTC signaling message kinds. */
export enum SignalingMessageType {
  Offer = 'offer',
  Answer = 'answer',
  IceCandidate = 'ice_candidate',
  Renegotiate = 'renegotiate',
  Hangup = 'hangup',
  Error = 'error',
}

/** Commands the control plane may send to an agent. */
export enum AgentCommandType {
  StartSession = 'start_session',
  EndSession = 'end_session',
  UpdateConfig = 'update_config',
  Restart = 'restart',
  SelfUpdate = 'self_update',
  CaptureScreenshot = 'capture_screenshot',
  LockInput = 'lock_input',
  UnlockInput = 'unlock_input',
  Ping = 'ping',
}

/** Agent command execution status. */
export enum AgentCommandStatus {
  Queued = 'queued',
  Sent = 'sent',
  Acked = 'acked',
  Running = 'running',
  Succeeded = 'succeeded',
  Failed = 'failed',
  TimedOut = 'timed_out',
  Cancelled = 'cancelled',
}

/** API key status. */
export enum ApiKeyStatus {
  Active = 'active',
  Revoked = 'revoked',
  Expired = 'expired',
}
