import { create } from 'zustand';
import type { LoginResponse, Organization, User } from '@nexusdesk/types';
import { fetchMe, login as apiLogin, logout as apiLogout, register as apiRegister } from '@/api/auth';
import { getStoredTokens, isDemoMode, onTokensChange, setTokens } from '@/api/client';
import { listOrganizations } from '@/api/orgs';
import { env } from '@/lib/env';
import { mockOrganization, mockUser } from '@/lib/mock-data';

interface AuthState {
  user: User | null;
  organizationId: string | null;
  organizations: Organization[];
  hydrated: boolean;
  loading: boolean;
  hydrate: () => Promise<void>;
  login: (email: string, password: string, organizationSlug?: string) => Promise<LoginResponse>;
  register: (input: {
    email: string;
    password: string;
    displayName: string;
    organizationName: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  setOrganizationId: (orgId: string) => void;
  setOrganizations: (orgs: Organization[]) => void;
  refreshProfile: () => Promise<void>;
}

function pickOrganizationId(meOrgId: string, orgs: Organization[]): string {
  const preferred = localStorage.getItem('nd_org_id');
  if (preferred && orgs.some((o) => o.id === preferred)) return preferred;
  if (orgs.some((o) => o.id === meOrgId)) return meOrgId;
  return orgs[0]?.id ?? meOrgId;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  organizationId: null,
  organizations: [],
  hydrated: false,
  loading: false,

  hydrate: async () => {
    const tokens = getStoredTokens();
    if (!tokens) {
      set({ hydrated: true, user: null, organizationId: null });
      return;
    }
    if (env.demoMode === 'off' && tokens.accessToken.startsWith('demo_')) {
      setTokens(null);
      set({ hydrated: true, user: null, organizationId: null, organizations: [] });
      return;
    }
    try {
      const me = await fetchMe();
      const orgs = await listOrganizations();
      const organizationId = pickOrganizationId(me.organizationId, orgs);
      localStorage.setItem('nd_org_id', organizationId);
      set({
        user: me.user,
        organizationId,
        organizations: orgs,
        hydrated: true,
      });
    } catch {
      if (isDemoMode() && tokens.accessToken.startsWith('demo_')) {
        set({
          user: mockUser,
          organizationId: mockOrganization.id,
          organizations: [mockOrganization],
          hydrated: true,
        });
        return;
      }
      setTokens(null);
      set({ user: null, organizationId: null, organizations: [], hydrated: true });
    }
  },

  login: async (email, password, organizationSlug) => {
    set({ loading: true });
    try {
      const res = await apiLogin({ email, password, organizationSlug });
      if (!res.requiresMfa) {
        const orgs = await listOrganizations();
        const me = await fetchMe();
        const organizationId = pickOrganizationId(me.organizationId, orgs);
        localStorage.setItem('nd_org_id', organizationId);
        set({
          user: me.user,
          organizationId,
          organizations: orgs,
        });
      }
      return res;
    } finally {
      set({ loading: false });
    }
  },

  register: async (input) => {
    set({ loading: true });
    try {
      await apiRegister(input);
      const me = await fetchMe();
      const orgs = await listOrganizations();
      const organizationId = pickOrganizationId(me.organizationId, orgs);
      localStorage.setItem('nd_org_id', organizationId);
      set({
        user: me.user,
        organizationId,
        organizations: orgs,
      });
    } finally {
      set({ loading: false });
    }
  },

  logout: async () => {
    await apiLogout({ everywhere: false });
    set({ user: null, organizationId: null, organizations: [] });
  },

  setOrganizationId: (orgId) => {
    if (!orgId || orgId.startsWith('org_demo_')) return;
    set({ organizationId: orgId });
    localStorage.setItem('nd_org_id', orgId);
  },

  setOrganizations: (orgs) => set({ organizations: orgs }),

  refreshProfile: async () => {
    const me = await fetchMe();
    const orgs = await listOrganizations();
    const organizationId = pickOrganizationId(me.organizationId, orgs);
    localStorage.setItem('nd_org_id', organizationId);
    set({ user: me.user, organizationId, organizations: orgs });
  },
}));

onTokensChange((tokens) => {
  if (!tokens) {
    useAuthStore.setState({ user: null, organizationId: null });
  }
});

export function selectIsAuthenticated(state: AuthState) {
  return Boolean(state.user && getStoredTokens());
}
