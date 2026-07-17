import {
  AgentCommandStatus,
  AgentCommandType,
  DevicePlatform,
  DeviceStatus,
  RemoteConnectionMode,
  SignalingMessageType,
} from '@nexusdesk/types';
import { z } from 'zod';

export const devicePlatformSchema = z.nativeEnum(DevicePlatform);
export const deviceStatusSchema = z.nativeEnum(DeviceStatus);
export const agentCommandTypeSchema = z.nativeEnum(AgentCommandType);
export const agentCommandStatusSchema = z.nativeEnum(AgentCommandStatus);
export const remoteConnectionModeSchema = z.nativeEnum(RemoteConnectionMode);
export const signalingMessageTypeSchema = z.nativeEnum(SignalingMessageType);

export const agentHeartbeatSchema = z.object({
  deviceId: z.string().min(1),
  organizationId: z.string().min(1),
  agentVersion: z.string().min(1),
  platform: devicePlatformSchema,
  osVersion: z.string().min(1),
  hostname: z.string().min(1),
  status: deviceStatusSchema,
  uptimeSeconds: z.number().nonnegative(),
  cpuPercent: z.number().min(0).max(100),
  memoryUsedMb: z.number().nonnegative(),
  memoryTotalMb: z.number().positive(),
  activeSessionIds: z.array(z.string()),
  ipAddresses: z.array(z.string()),
  timestamp: z.number().int().positive(),
  nonce: z.string().min(8),
});

export const agentCommandSchema = z.object({
  id: z.string().min(1),
  deviceId: z.string().min(1),
  organizationId: z.string().min(1),
  type: agentCommandTypeSchema,
  status: agentCommandStatusSchema,
  payload: z.record(z.unknown()),
  createdAt: z.string().datetime(),
  sentAt: z.string().datetime().nullable(),
  ackedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  error: z.string().nullable(),
  timeoutMs: z.number().int().positive(),
  correlationId: z.string().min(1),
});

export const agentCommandResultSchema = z.object({
  commandId: z.string().min(1),
  deviceId: z.string().min(1),
  status: agentCommandStatusSchema,
  result: z.record(z.unknown()).nullable(),
  error: z.string().nullable(),
  completedAt: z.string().datetime(),
});

export const agentEnrollmentRequestSchema = z.object({
  enrollmentToken: z.string().min(16),
  hostname: z.string().min(1).max(255),
  platform: devicePlatformSchema,
  osVersion: z.string().min(1),
  agentVersion: z.string().min(1),
  publicKey: z.string().min(32),
  metadata: z.record(z.string()).optional(),
});

export const agentEnrollmentResponseSchema = z.object({
  deviceId: z.string().min(1),
  organizationId: z.string().min(1),
  deviceToken: z.string().min(1),
  refreshToken: z.string().min(1),
  heartbeatIntervalMs: z.number().int().positive(),
  wsUrl: z.string().url(),
});

const sdpPayloadSchema = z.object({
  sdp: z.string().min(1),
  sdpType: z.enum(['offer', 'answer']),
});

const iceCandidatePayloadSchema = z.object({
  candidate: z.string().min(1),
  sdpMid: z.string().nullable(),
  sdpMLineIndex: z.number().int().nullable(),
  usernameFragment: z.string().nullable(),
});

const signalingBase = {
  sessionId: z.string().min(1),
  connectionId: z.string().min(1),
  fromPeerId: z.string().min(1),
  toPeerId: z.string().min(1),
  timestamp: z.number().int().positive(),
};

export const signalingOfferSchema = z.object({
  ...signalingBase,
  type: z.literal(SignalingMessageType.Offer),
  payload: sdpPayloadSchema.extend({
    mode: remoteConnectionModeSchema,
  }),
});

export const signalingAnswerSchema = z.object({
  ...signalingBase,
  type: z.literal(SignalingMessageType.Answer),
  payload: sdpPayloadSchema,
});

export const signalingIceCandidateSchema = z.object({
  ...signalingBase,
  type: z.literal(SignalingMessageType.IceCandidate),
  payload: iceCandidatePayloadSchema,
});

export const signalingRenegotiateSchema = z.object({
  ...signalingBase,
  type: z.literal(SignalingMessageType.Renegotiate),
  payload: sdpPayloadSchema.extend({
    reason: z.string().min(1),
  }),
});

export const signalingHangupSchema = z.object({
  ...signalingBase,
  type: z.literal(SignalingMessageType.Hangup),
  payload: z.object({
    reason: z.string().min(1),
  }),
});

export const signalingErrorSchema = z.object({
  ...signalingBase,
  type: z.literal(SignalingMessageType.Error),
  payload: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});

export const signalingMessageSchema = z.discriminatedUnion('type', [
  signalingOfferSchema,
  signalingAnswerSchema,
  signalingIceCandidateSchema,
  signalingRenegotiateSchema,
  signalingHangupSchema,
  signalingErrorSchema,
]);

/** Top-level agent wire protocol envelope. */
export const agentProtocolMessageSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('heartbeat'),
    id: z.string().min(1),
    data: agentHeartbeatSchema,
  }),
  z.object({
    kind: z.literal('command'),
    id: z.string().min(1),
    data: agentCommandSchema,
  }),
  z.object({
    kind: z.literal('command_result'),
    id: z.string().min(1),
    data: agentCommandResultSchema,
  }),
  z.object({
    kind: z.literal('signaling'),
    id: z.string().min(1),
    data: signalingMessageSchema,
  }),
  z.object({
    kind: z.literal('ping'),
    id: z.string().min(1),
    data: z.object({ timestamp: z.number().int().positive() }),
  }),
  z.object({
    kind: z.literal('pong'),
    id: z.string().min(1),
    data: z.object({ timestamp: z.number().int().positive() }),
  }),
]);

export type AgentProtocolMessage = z.infer<typeof agentProtocolMessageSchema>;
export type AgentHeartbeatParsed = z.infer<typeof agentHeartbeatSchema>;
export type SignalingMessageParsed = z.infer<typeof signalingMessageSchema>;
