import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { envInt, parseEnv } from '@nexusdesk/utils';
import { z } from 'zod';

/** Resolve the OS-appropriate directory used to persist agent state. */
export function getDataDir(): string {
  const plat = platform();
  const overridden = process.env['NEXUSDESK_AGENT_DATA_DIR'];
  if (overridden) return overridden;

  if (plat === 'win32') {
    const programData = process.env['ProgramData'] ?? 'C:\\ProgramData';
    return join(programData, 'NexusDesk', 'Agent');
  }

  if (plat === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'NexusDesk', 'Agent');
  }

  // Linux and other POSIX platforms.
  if (process.getuid?.() === 0) {
    return '/etc/nexusdesk/agent';
  }
  return join(homedir(), '.config', 'nexusdesk', 'agent');
}

export function ensureDataDir(): string {
  const dir = getDataDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  API_URL: z.string().url().default('http://localhost:4000'),
  WS_URL: z.string().default('ws://localhost:4000'),

  /** One-time enrollment token used only on first run; discarded after enrollment. */
  AGENT_ENROLLMENT_TOKEN: z.string().optional(),
  AGENT_ENROLLMENT_SECRET: z.string().optional(),
  /** ScreenConnect-style guest support code from /join/:code */
  GUEST_CODE: z.string().optional(),

  AGENT_HEARTBEAT_INTERVAL_MS: envInt.default(30_000),
  AGENT_OFFLINE_THRESHOLD_MS: envInt.default(90_000),
  AGENT_MAX_RECONNECT_DELAY_MS: envInt.default(60_000),

  /** 32-byte base64 key for encrypting the on-disk auth token. Falls back to a machine key file. */
  ENCRYPTION_KEY: z.string().optional(),

  AGENT_CAPTURE_FPS: envInt.default(10),
  AGENT_CAPTURE_QUALITY: envInt.default(60),
  AGENT_UPDATE_URL: z.string().url().optional(),
  AGENT_UPDATE_CHECK_INTERVAL_MS: envInt.default(6 * 60 * 60 * 1000),
});

export type AgentEnv = z.infer<typeof envSchema>;

export function loadEnv(env: Record<string, string | undefined> = process.env): AgentEnv {
  return parseEnv(envSchema, env);
}

/** Persisted, non-secret runtime state written after successful enrollment. */
export interface AgentRuntimeState {
  deviceId: string;
  organizationId: string;
  heartbeatIntervalMs: number;
  wsUrl: string;
  enrolledAt: string;
  agentVersion: string;
  /** Last guest support code used to enroll (if any). */
  guestCode?: string;
}

function stateFilePath(): string {
  return join(ensureDataDir(), 'state.json');
}

export function loadRuntimeState(): AgentRuntimeState | null {
  const path = stateFilePath();
  if (!existsSync(path)) return null;

  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as AgentRuntimeState;
    if (!parsed?.deviceId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveRuntimeState(state: AgentRuntimeState): void {
  writeFileSync(stateFilePath(), JSON.stringify(state, null, 2), { mode: 0o600 });
}

export function clearRuntimeState(): void {
  const path = stateFilePath();
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      writeFileSync(path, '', { mode: 0o600 });
    }
  }
}

/** True when a provided guest code means we must enroll again. */
export function shouldReenroll(
  state: AgentRuntimeState | null,
  tokensPresent: boolean,
  guestCode: string | undefined,
): boolean {
  if (!state || !tokensPresent) return true;
  if (!guestCode) return false;
  return (state.guestCode ?? '').toUpperCase() !== guestCode.trim().toUpperCase();
}

export const AGENT_VERSION = '0.1.5';
