import { API_ROUTES, buildApiPath } from '@nexusdesk/shared';
import { apiRequest, withDemoFallback } from '@/api/client';
import type { GuestInviteTemplate } from '@/lib/guest-invite';

export interface GuestAccessLink {
  id: string;
  organizationId: string;
  createdByUserId: string;
  code: string;
  label: string;
  inviteTemplate: GuestInviteTemplate;
  status: 'active' | 'exhausted' | 'expired' | 'revoked';
  expiresAt: string;
  maxUses: number;
  usedCount: number;
  lastClaimedDeviceId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CreateGuestLinkResult {
  link: GuestAccessLink;
  joinUrl: string;
  installerUrl: string;
  enrollmentToken: string;
}

export interface PublicGuestLink {
  code: string;
  label: string;
  inviteTemplate: GuestInviteTemplate;
  organizationName: string;
  organizationSlug: string;
  expiresAt: string;
  remainingUses: number;
  windowsInstallerUrl: string;
  installerFileName?: string;
  windowsScriptUrl?: string;
  agentPackageUrl: string;
  joinUrl: string;
  instructions: { windows: string[] };
}

export function listGuestLinks(orgId: string) {
  return withDemoFallback(
    () =>
      apiRequest<GuestAccessLink[]>(
        buildApiPath(API_ROUTES.guestLinks.root, { orgId }),
      ),
    async () => [],
  );
}

export function createGuestLink(
  orgId: string,
  body?: {
    label?: string;
    notes?: string;
    maxUses?: number;
    ttl?: string;
    inviteTemplate?: GuestInviteTemplate;
  },
) {
  return apiRequest<CreateGuestLinkResult>(
    buildApiPath(API_ROUTES.guestLinks.root, { orgId }),
    { method: 'POST', body },
  );
}

export function revokeGuestLink(orgId: string, linkId: string) {
  return apiRequest(
    buildApiPath(API_ROUTES.guestLinks.revoke, { orgId, linkId }),
    { method: 'POST' },
  );
}

export function deleteGuestLink(orgId: string, linkId: string) {
  return apiRequest(
    buildApiPath(API_ROUTES.guestLinks.byId, { orgId, linkId }),
    { method: 'DELETE' },
  );
}

export async function fetchPublicGuestLink(code: string): Promise<PublicGuestLink> {
  const base = (import.meta.env.VITE_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
  const res = await fetch(`${base}/guest/${encodeURIComponent(code)}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Guest link unavailable (${res.status})`);
  }
  return (await res.json()) as PublicGuestLink;
}
