import type { AgentCommandStatus, AgentCommandType, DevicePlatform, DeviceStatus } from './enums.js';

/** Command issued from the control plane to a device agent. */
export interface AgentCommand {
  id: string;
  deviceId: string;
  organizationId: string;
  type: AgentCommandType;
  status: AgentCommandStatus;
  payload: Record<string, unknown>;
  createdAt: string;
  sentAt: string | null;
  ackedAt: string | null;
  completedAt: string | null;
  error: string | null;
  timeoutMs: number;
  correlationId: string;
}

export interface AgentCommandResult {
  commandId: string;
  deviceId: string;
  status: AgentCommandStatus;
  result: Record<string, unknown> | null;
  error: string | null;
  completedAt: string;
}

/** Periodic heartbeat from agent → control plane. */
export interface AgentHeartbeat {
  deviceId: string;
  organizationId: string;
  agentVersion: string;
  platform: DevicePlatform;
  osVersion: string;
  hostname: string;
  status: DeviceStatus;
  uptimeSeconds: number;
  cpuPercent: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  activeSessionIds: string[];
  ipAddresses: string[];
  timestamp: number;
  nonce: string;
}

export interface AgentEnrollmentRequest {
  enrollmentToken: string;
  hostname: string;
  platform: DevicePlatform;
  osVersion: string;
  agentVersion: string;
  publicKey: string;
  metadata?: Record<string, string>;
}

export interface AgentEnrollmentResponse {
  deviceId: string;
  organizationId: string;
  deviceToken: string;
  refreshToken: string;
  heartbeatIntervalMs: number;
  wsUrl: string;
}

export interface AgentConfig {
  heartbeatIntervalMs: number;
  offlineThresholdMs: number;
  maxConcurrentSessions: number;
  allowControl: boolean;
  allowViewOnly: boolean;
  recordingEnabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
