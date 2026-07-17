import { z } from 'zod';
import { envBoolean, envCsv, envInt, envPositiveInt, parseEnv } from '@nexusdesk/utils';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  HOST: z.string().default('0.0.0.0'),
  PORT: envInt.default(4000),

  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),
  WS_URL: z.string().default('ws://localhost:4000'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  REDIS_PREFIX: z.string().default('nexusdesk:'),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  JWT_ISSUER: z.string().default('nexusdesk'),
  JWT_AUDIENCE: z.string().default('nexusdesk-api'),

  SESSION_SECRET: z.string().min(32),
  COOKIE_SECURE: envBoolean.default(false),
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  ENCRYPTION_KEY: z.string().min(1),

  AGENT_ENROLLMENT_SECRET: z.string().min(16),
  AGENT_HEARTBEAT_INTERVAL_MS: envPositiveInt.default(30_000),
  AGENT_OFFLINE_THRESHOLD_MS: envPositiveInt.default(90_000),

  STUN_URLS: envCsv.default(['stun:stun.l.google.com:19302']),
  TURN_URLS: envCsv.default([]),
  TURN_USERNAME: z.string().optional().default(''),
  TURN_CREDENTIAL: z.string().optional().default(''),
  TURN_CREDENTIAL_TTL: envPositiveInt.default(86_400),

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: envInt.default(1025),
  SMTP_SECURE: envBoolean.default(false),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('NexusDesk <noreply@nexusdesk.local>'),

  RATE_LIMIT_WINDOW_MS: envPositiveInt.default(60_000),
  RATE_LIMIT_MAX_REQUESTS: envPositiveInt.default(120),
  RATE_LIMIT_AUTH_MAX: envPositiveInt.default(20),

  CORS_ORIGINS: envCsv.default(['http://localhost:3000', 'http://localhost:5173']),

  FEATURE_VIEW_ONLY_DEFAULT: envBoolean.default(false),
  FEATURE_RECORDING_ENABLED: envBoolean.default(true),
  FEATURE_AUDIT_RETENTION_DAYS: envPositiveInt.default(90),

  INTERNAL_API_TOKEN: z.string().min(16),
  SERVICE_NAME: z.string().default('nexusdesk-api'),

  LOCKOUT_MAX_ATTEMPTS: envPositiveInt.default(5),
  LOCKOUT_DURATION_MS: envPositiveInt.default(15 * 60 * 1000),
  MAX_CONCURRENT_SESSIONS_PER_DEVICE: envPositiveInt.default(5),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  cached = parseEnv(envSchema, source);
  return cached;
}

export function getEnv(): Env {
  if (!cached) {
    return loadEnv();
  }
  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}
