import { UserRole } from '@nexusdesk/types';
import { z } from 'zod';

export const userRoleSchema = z.nativeEnum(UserRole);

export const accessTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  org: z.string().min(1),
  email: z.string().email(),
  role: userRoleSchema,
  typ: z.literal('access'),
  iss: z.string().min(1),
  aud: z.union([z.string(), z.array(z.string()).min(1)]),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  jti: z.string().min(1),
  sid: z.string().min(1).optional(),
});

export const refreshTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  org: z.string().min(1),
  typ: z.literal('refresh'),
  iss: z.string().min(1),
  aud: z.union([z.string(), z.array(z.string()).min(1)]),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  jti: z.string().min(1),
  fam: z.string().min(1),
});

export const agentTokenClaimsSchema = z.object({
  sub: z.string().min(1),
  org: z.string().min(1),
  typ: z.literal('agent'),
  iss: z.string().min(1),
  aud: z.union([z.string(), z.array(z.string()).min(1)]),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
  jti: z.string().min(1),
  did: z.string().min(1),
});

export const authTokenClaimsSchema = z.discriminatedUnion('typ', [
  accessTokenClaimsSchema,
  refreshTokenClaimsSchema,
  agentTokenClaimsSchema,
]);

export type AccessTokenClaimsParsed = z.infer<typeof accessTokenClaimsSchema>;
export type RefreshTokenClaimsParsed = z.infer<typeof refreshTokenClaimsSchema>;
export type AgentTokenClaimsParsed = z.infer<typeof agentTokenClaimsSchema>;
export type AuthTokenClaimsParsed = z.infer<typeof authTokenClaimsSchema>;
