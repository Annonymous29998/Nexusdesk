import type { UserRole } from './enums.js';

/** Access token JWT payload claims. */
export interface AccessTokenClaims {
  sub: string;
  org: string;
  email: string;
  role: UserRole;
  typ: 'access';
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
  jti: string;
  sid?: string;
}

/** Refresh token JWT payload claims. */
export interface RefreshTokenClaims {
  sub: string;
  org: string;
  typ: 'refresh';
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
  jti: string;
  fam: string;
}

/** Agent device token claims. */
export interface AgentTokenClaims {
  sub: string;
  org: string;
  typ: 'agent';
  iss: string;
  aud: string | string[];
  iat: number;
  exp: number;
  jti: string;
  did: string;
}

export type AuthTokenClaims = AccessTokenClaims | RefreshTokenClaims | AgentTokenClaims;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  tokenType: 'Bearer';
}

export interface LoginRequest {
  email: string;
  password: string;
  organizationSlug?: string;
  mfaCode?: string;
}

export interface LoginResponse {
  user: {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
    organizationId: string;
  };
  tokens: TokenPair;
  requiresMfa: boolean;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken?: string;
  everywhere?: boolean;
}
