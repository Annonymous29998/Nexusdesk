import { z } from 'zod';
import { emailSchema, passwordSchema, paginationSchema, slugSchema } from '@nexusdesk/utils';
import { UserRole, RemoteConnectionMode, DevicePlatform } from '@nexusdesk/types';

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(120),
  organizationName: z.string().trim().min(1).max(120),
  organizationSlug: slugSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  organizationSlug: slugSchema.optional(),
  mfaCode: z.string().min(6).max(12).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = z.object({
  refreshToken: z.string().optional(),
  everywhere: z.boolean().optional(),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const mfaCodeSchema = z.object({
  code: z.string().min(6).max(12),
});

export const updateUserSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  role: z.nativeEnum(UserRole).optional(),
});

export const updateOrgSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  logoUrl: z.string().url().nullable().optional(),
  settings: z.record(z.unknown()).optional(),
});

export const createDeviceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  hostname: z.string().trim().min(1).max(255),
  platform: z.nativeEnum(DevicePlatform).optional(),
  osVersion: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const updateDeviceSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  tags: z.array(z.string()).optional(),
  status: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const enrollDeviceSchema = z.object({
  enrollmentToken: z.string().min(16),
  hostname: z.string().min(1).max(255),
  platform: z.nativeEnum(DevicePlatform),
  osVersion: z.string().min(1),
  agentVersion: z.string().min(1),
  publicKey: z.string().min(32),
  metadata: z.record(z.string()).optional(),
  organizationId: z.string().optional(),
  organizationSlug: slugSchema.optional(),
});

export const heartbeatSchema = z.object({
  agentVersion: z.string().optional(),
  status: z.string().optional(),
  hostname: z.string().optional(),
  osVersion: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const createSessionSchema = z.object({
  deviceId: z.string().min(1),
  mode: z.nativeEnum(RemoteConnectionMode).optional(),
  notes: z.string().max(4000).optional(),
  recordingEnabled: z.boolean().optional(),
});

export const joinSessionSchema = z.object({
  mode: z.nativeEnum(RemoteConnectionMode).optional(),
  peerId: z.string().optional(),
});

export const endSessionSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const sessionNotesSchema = z.object({
  notes: z.string().max(4000),
});

export const createInvitationSchema = z.object({
  email: emailSchema,
  role: z.nativeEnum(UserRole),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
});

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const updateSettingsSchema = z.object({
  settings: z.record(z.unknown()),
});

export const pageQuerySchema = paginationSchema;

export const orgIdParams = z.object({ orgId: z.string().min(1) });
export const orgUserParams = z.object({ orgId: z.string().min(1), userId: z.string().min(1) });
export const orgDeviceParams = z.object({ orgId: z.string().min(1), deviceId: z.string().min(1) });
export const orgSessionParams = z.object({
  orgId: z.string().min(1),
  sessionId: z.string().min(1),
});
