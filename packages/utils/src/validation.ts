import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(320);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case alphanumeric');

export const uuidSchema = z.string().uuid();

export const nonEmptyString = z.string().trim().min(1);

export const passwordSchema = z
  .string()
  .min(10, 'password must be at least 10 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'password must contain a letter')
  .regex(/[0-9]/, 'password must contain a number');

export const hexColorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'invalid hex color');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export function isValidEmail(value: string): boolean {
  return emailSchema.safeParse(value).success;
}

export function isValidSlug(value: string): boolean {
  return slugSchema.safeParse(value).success;
}

export function isValidUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}

/** Safe JSON parse that returns undefined on failure. */
export function safeJsonParse<T = unknown>(raw: string): T | undefined {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

/** Clamp a number into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Pick defined keys from an object. */
export function pickDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}
