import { API_ROUTES } from '@nexusdesk/shared';
import type { LoginRequest, LoginResponse, LogoutRequest, User } from '@nexusdesk/types';
import {
  ApiClientError,
  apiRequest,
  delay,
  setTokens,
  withDemoFallback,
} from '@/api/client';
import {
  createMockTokens,
  mockOrganization,
  mockUser,
  mockUsers,
} from '@/lib/mock-data';

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  organizationName: string;
}

export interface MeResponse {
  user: User;
  organizationId: string;
}

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  return withDemoFallback(
    () =>
      apiRequest<LoginResponse>(API_ROUTES.auth.login, {
        method: 'POST',
        body: payload,
        auth: false,
      }).then((res) => {
        if (!res.requiresMfa) setTokens(res.tokens);
        return res;
      }),
    async () => {
      await delay();
      const email = payload.email.toLowerCase();
      const user =
        mockUsers.find((u) => u.email.toLowerCase() === email) ??
        ({
          ...mockUser,
          email: payload.email,
          displayName: payload.email.split('@')[0] ?? 'Demo User',
        } satisfies User);

      if (payload.password.length < 4) {
        throw new ApiClientError('Invalid credentials', 401, {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        });
      }

      const tokens = createMockTokens();
      setTokens(tokens);
      return {
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          organizationId: user.organizationId || mockOrganization.id,
        },
        tokens,
        requiresMfa: false,
      };
    },
  );
}

export async function register(payload: RegisterRequest): Promise<LoginResponse> {
  return withDemoFallback(
    () =>
      apiRequest<LoginResponse>('/auth/register', {
        method: 'POST',
        body: payload,
        auth: false,
      }).then((res) => {
        setTokens(res.tokens);
        return res;
      }),
    async () => {
      await delay();
      const tokens = createMockTokens();
      setTokens(tokens);
      return {
        user: {
          id: `usr_${Date.now()}`,
          email: payload.email,
          displayName: payload.displayName,
          role: mockUser.role,
          organizationId: mockOrganization.id,
        },
        tokens,
        requiresMfa: false,
      };
    },
  );
}

export async function logout(payload: LogoutRequest = {}): Promise<void> {
  try {
    await withDemoFallback(
      () =>
        apiRequest<void>(API_ROUTES.auth.logout, {
          method: 'POST',
          body: payload,
        }),
      async () => {
        await delay(80);
      },
    );
  } finally {
    setTokens(null);
  }
}

interface MeApiResponse {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  mfaEnabled: boolean;
  emailVerifiedAt: string | null;
  role: User['role'];
  organizationId: string;
  lastLoginAt: string | null;
}

export async function fetchMe(): Promise<MeResponse> {
  return withDemoFallback(
    async () => {
      const raw = await apiRequest<MeApiResponse | MeResponse>(API_ROUTES.auth.me);
      // The API returns a flat user object; adapt to { user, organizationId }.
      if ('user' in raw && raw.user) {
        return raw as MeResponse;
      }
      const flat = raw as MeApiResponse;
      return {
        user: {
          id: flat.id,
          email: flat.email,
          displayName: flat.displayName,
          avatarUrl: flat.avatarUrl,
          role: flat.role,
          organizationId: flat.organizationId,
          mfaEnabled: flat.mfaEnabled,
          emailVerifiedAt: flat.emailVerifiedAt,
          lastLoginAt: flat.lastLoginAt,
        } as unknown as User,
        organizationId: flat.organizationId,
      };
    },
    async () => {
      await delay();
      return { user: mockUser, organizationId: mockOrganization.id };
    },
  );
}

export async function forgotPassword(email: string): Promise<{ ok: true }> {
  return withDemoFallback(
    () =>
      apiRequest<{ ok: true }>(API_ROUTES.auth.forgotPassword, {
        method: 'POST',
        body: { email },
        auth: false,
      }),
    async () => {
      await delay();
      return { ok: true as const };
    },
  );
}

export async function resetPassword(token: string, password: string): Promise<{ ok: true }> {
  return withDemoFallback(
    () =>
      apiRequest<{ ok: true }>(API_ROUTES.auth.resetPassword, {
        method: 'POST',
        body: { token, password },
        auth: false,
      }),
    async () => {
      await delay();
      if (!token || password.length < 8) {
        throw new ApiClientError('Invalid reset request', 400, {
          code: 'VALIDATION',
          message: 'Token and password (min 8 chars) are required',
        });
      }
      return { ok: true as const };
    },
  );
}
