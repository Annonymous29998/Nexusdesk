import { z, type ZodError, type ZodTypeAny } from 'zod';

export class EnvValidationError extends Error {
  override readonly name = 'EnvValidationError';
  readonly issues: ZodError['issues'];

  constructor(error: ZodError) {
    const lines = error.issues.map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : '(root)';
      return `  - ${path}: ${issue.message}`;
    });
    super(`Invalid environment variables:\n${lines.join('\n')}`);
    this.issues = error.issues;
  }
}

/** Coerce common boolean env string forms. */
export const envBoolean = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;
  const v = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'off', ''].includes(v)) return false;
  return value;
}, z.boolean());

/** Coerce integer from env string. */
export const envInt = z.coerce.number().int();

/** Coerce positive integer. */
export const envPositiveInt = envInt.positive();

/** Comma-separated string list. */
export const envCsv = z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return value;
  if (value.trim() === '') return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}, z.array(z.string()));

/**
 * Parse `process.env` (or a custom record) against a Zod schema.
 * Throws EnvValidationError with a readable message on failure.
 */
export function parseEnv<T extends ZodTypeAny>(
  schema: T,
  env: Record<string, string | undefined> = process.env,
): z.infer<T> {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new EnvValidationError(result.error);
  }
  return result.data;
}

/** Non-throwing variant. */
export function safeParseEnv<T extends ZodTypeAny>(
  schema: T,
  env: Record<string, string | undefined> = process.env,
): { success: true; data: z.infer<T> } | { success: false; error: EnvValidationError } {
  const result = schema.safeParse(env);
  if (!result.success) {
    return { success: false, error: new EnvValidationError(result.error) };
  }
  return { success: true, data: result.data };
}

/** Require a single env var or throw. */
export function requireEnv(name: string, env: Record<string, string | undefined> = process.env): string {
  const value = env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
