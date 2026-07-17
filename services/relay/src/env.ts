import { envCsv, envInt, parseEnv, requireEnv } from '@nexusdesk/utils';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  RELAY_HOST: z.string().default('0.0.0.0'),
  RELAY_PORT: envInt.default(4002),

  /** Shared secret configured in coturn via `static-auth-secret`. */
  TURN_SHARED_SECRET: z.string().min(16, 'TURN_SHARED_SECRET must be at least 16 characters'),
  TURN_REALM: z.string().default('nexusdesk.local'),
  TURN_URLS: envCsv.default('turn:localhost:3478,turns:localhost:5349'),
  STUN_URLS: envCsv.default('stun:localhost:3478'),
  TURN_CREDENTIAL_TTL: envInt.default(86_400),

  CORS_ORIGINS: z.string().default('*'),
});

export type RelayEnv = z.infer<typeof envSchema>;

export function loadEnv(env: Record<string, string | undefined> = process.env): RelayEnv {
  requireEnv('TURN_SHARED_SECRET', env);
  return parseEnv(envSchema, env);
}
