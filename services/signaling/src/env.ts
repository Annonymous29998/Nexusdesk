import { envInt, parseEnv, requireEnv } from '@nexusdesk/utils';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  SIGNALING_HOST: z.string().default('0.0.0.0'),
  SIGNALING_PORT: envInt.default(4001),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().default('nexusdesk'),
  JWT_AUDIENCE: z.string().default('nexusdesk-api'),

  SIGNALING_HEARTBEAT_INTERVAL_MS: envInt.default(15_000),
  SIGNALING_HEARTBEAT_TIMEOUT_MS: envInt.default(45_000),
  SIGNALING_MAX_PEERS_PER_ROOM: envInt.default(8),
  SIGNALING_MAX_MESSAGE_BYTES: envInt.default(64 * 1024),

  CORS_ORIGINS: z.string().default('*'),
});

export type SignalingEnv = z.infer<typeof envSchema>;

export function loadEnv(env: Record<string, string | undefined> = process.env): SignalingEnv {
  // Fail fast with a readable message rather than a generic zod stack trace.
  requireEnv('JWT_ACCESS_SECRET', env);
  return parseEnv(envSchema, env);
}
