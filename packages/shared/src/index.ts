export {
  ALL_ROLES,
  DEFAULT_AGENT_SETTINGS,
  DEFAULT_ORGANIZATION_SETTINGS,
  DEFAULT_PAGINATION,
  hasPermission,
  HUMAN_ROLES,
  PERMISSIONS_MATRIX,
  ROLE_RANK,
  roleAtLeast,
  TOKEN_DEFAULTS,
} from './roles.js';

export { API_ROUTES, buildApiPath, type ApiRoutes } from './routes.js';

export { WS_EVENTS, type WsEventName } from './ws-events.js';

export {
  createApiError,
  ERROR_CODES,
  type ApiErrorBody,
  type ErrorCode,
} from './errors.js';

export {
  accessTokenClaimsSchema,
  agentTokenClaimsSchema,
  authTokenClaimsSchema,
  refreshTokenClaimsSchema,
  userRoleSchema,
  type AccessTokenClaimsParsed,
  type AgentTokenClaimsParsed,
  type AuthTokenClaimsParsed,
  type RefreshTokenClaimsParsed,
} from './jwt.js';

export {
  agentCommandResultSchema,
  agentCommandSchema,
  agentCommandStatusSchema,
  agentCommandTypeSchema,
  agentEnrollmentRequestSchema,
  agentEnrollmentResponseSchema,
  agentHeartbeatSchema,
  agentProtocolMessageSchema,
  devicePlatformSchema,
  deviceStatusSchema,
  remoteConnectionModeSchema,
  signalingAnswerSchema,
  signalingErrorSchema,
  signalingHangupSchema,
  signalingIceCandidateSchema,
  signalingMessageSchema,
  signalingMessageTypeSchema,
  signalingOfferSchema,
  signalingRenegotiateSchema,
  type AgentHeartbeatParsed,
  type AgentProtocolMessage,
  type SignalingMessageParsed,
} from './agent-protocol.js';
