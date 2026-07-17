/** WebSocket / realtime event names. */
export const WS_EVENTS = {
  // Connection lifecycle
  connect: 'connection:connect',
  disconnect: 'connection:disconnect',
  error: 'connection:error',
  ping: 'connection:ping',
  pong: 'connection:pong',

  // Auth
  auth: 'auth:authenticate',
  authOk: 'auth:ok',
  authError: 'auth:error',

  // Device / agent
  agentRegister: 'agent:register',
  agentHeartbeat: 'agent:heartbeat',
  agentCommand: 'agent:command',
  agentCommandResult: 'agent:command_result',
  deviceStatusChanged: 'device:status_changed',

  // Sessions
  sessionCreated: 'session:created',
  sessionUpdated: 'session:updated',
  sessionEnded: 'session:ended',

  // WebRTC signaling
  signalOffer: 'signal:offer',
  signalAnswer: 'signal:answer',
  signalIce: 'signal:ice_candidate',
  signalRenegotiate: 'signal:renegotiate',
  signalHangup: 'signal:hangup',
  signalError: 'signal:error',

  // Screen streaming (WebSocket JPEG frames)
  viewerStart: 'viewer:start',
  viewerStop: 'viewer:stop',
  screenFrame: 'screen:frame',
  screenMeta: 'screen:meta',
  inputEvent: 'input:event',

  // Notifications
  notificationCreated: 'notification:created',
  notificationUpdated: 'notification:updated',

  // Presence
  presenceUpdate: 'presence:update',
} as const;

export type WsEventName = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
