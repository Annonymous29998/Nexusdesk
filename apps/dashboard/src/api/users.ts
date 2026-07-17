import { API_ROUTES, buildApiPath } from '@nexusdesk/shared';
import type { Paginated, User, UserRole } from '@nexusdesk/types';
import { apiRequest, delay, withDemoFallback } from '@/api/client';
import { mockUsers, nowIso } from '@/lib/mock-data';

export interface UserListParams {
  orgId: string;
  page?: number;
  pageSize?: number;
  search?: string;
  role?: string;
}

export interface InviteUserRequest {
  email: string;
  role: UserRole;
  displayName?: string;
}

export interface UpdateUserRequest {
  role?: UserRole;
  isActive?: boolean;
  displayName?: string;
}

function filterUsers(params: UserListParams): Paginated<User> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  let items = mockUsers.filter((u) => u.organizationId === params.orgId || params.orgId);
  if (params.search) {
    const q = params.search.toLowerCase();
    items = items.filter(
      (u) => u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q),
    );
  }
  if (params.role) items = items.filter((u) => u.role === params.role);
  const start = (page - 1) * pageSize;
  const slice = items.slice(start, start + pageSize);
  return {
    items: slice,
    total: items.length,
    page,
    pageSize,
    hasMore: start + pageSize < items.length,
  };
}

export async function listUsers(params: UserListParams): Promise<Paginated<User>> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.search) query.set('search', params.search);
  if (params.role) query.set('role', params.role);
  const qs = query.toString();
  const path =
    buildApiPath(API_ROUTES.users.root, { orgId: params.orgId }) + (qs ? `?${qs}` : '');

  return withDemoFallback(
    () => apiRequest<Paginated<User>>(path),
    async () => {
      await delay();
      return filterUsers(params);
    },
  );
}

export async function updateUser(
  orgId: string,
  userId: string,
  patch: UpdateUserRequest,
): Promise<User> {
  const path = buildApiPath(API_ROUTES.users.byId, { orgId, userId });
  return withDemoFallback(
    () => apiRequest<User>(path, { method: 'PATCH', body: patch }),
    async () => {
      await delay();
      const idx = mockUsers.findIndex((u) => u.id === userId);
      if (idx < 0) throw new Error('User not found');
      const updated = { ...mockUsers[idx]!, ...patch, updatedAt: nowIso() };
      mockUsers[idx] = updated;
      return updated;
    },
  );
}

export async function inviteUser(orgId: string, payload: InviteUserRequest): Promise<User> {
  const path = buildApiPath(API_ROUTES.invitations.root, { orgId });
  return withDemoFallback(
    () => apiRequest<User>(path, { method: 'POST', body: payload }),
    async () => {
      await delay();
      const user: User = {
        id: `usr_${Date.now()}`,
        organizationId: orgId,
        email: payload.email,
        emailVerifiedAt: null,
        displayName: payload.displayName ?? payload.email.split('@')[0] ?? 'Invited User',
        avatarUrl: null,
        role: payload.role,
        mfaEnabled: false,
        lastLoginAt: null,
        lastLoginIp: null,
        isActive: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        deletedAt: null,
      };
      mockUsers.push(user);
      return user;
    },
  );
}
