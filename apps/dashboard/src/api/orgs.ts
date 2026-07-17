import { API_ROUTES, buildApiPath } from '@nexusdesk/shared';
import type { Organization, OrganizationSettings } from '@nexusdesk/types';
import { apiRequest, delay, withDemoFallback } from '@/api/client';
import { mockOrganization, mockOrganizations, nowIso } from '@/lib/mock-data';

export async function listOrganizations(): Promise<Organization[]> {
  return withDemoFallback(
    () => apiRequest<Organization[]>(API_ROUTES.organizations.root),
    async () => {
      await delay();
      return [...mockOrganizations];
    },
  );
}

export async function getOrganization(orgId: string): Promise<Organization> {
  const path = buildApiPath(API_ROUTES.organizations.byId, { orgId });
  return withDemoFallback(
    () => apiRequest<Organization>(path),
    async () => {
      await delay();
      return mockOrganizations.find((o) => o.id === orgId) ?? mockOrganization;
    },
  );
}

export async function updateOrganization(
  orgId: string,
  patch: Partial<Pick<Organization, 'name' | 'logoUrl'>>,
): Promise<Organization> {
  const path = buildApiPath(API_ROUTES.organizations.byId, { orgId });
  return withDemoFallback(
    () => apiRequest<Organization>(path, { method: 'PATCH', body: patch }),
    async () => {
      await delay();
      const idx = mockOrganizations.findIndex((o) => o.id === orgId);
      if (idx < 0) throw new Error('Organization not found');
      const updated = { ...mockOrganizations[idx]!, ...patch, updatedAt: nowIso() };
      mockOrganizations[idx] = updated;
      return updated;
    },
  );
}

export async function updateOrganizationSettings(
  orgId: string,
  settings: Partial<OrganizationSettings>,
): Promise<Organization> {
  const path = buildApiPath(API_ROUTES.organizations.settings, { orgId });
  return withDemoFallback(
    () => apiRequest<Organization>(path, { method: 'PATCH', body: settings }),
    async () => {
      await delay();
      const idx = mockOrganizations.findIndex((o) => o.id === orgId);
      if (idx < 0) throw new Error('Organization not found');
      const current = mockOrganizations[idx]!;
      const updated = {
        ...current,
        settings: { ...current.settings, ...settings },
        updatedAt: nowIso(),
      };
      mockOrganizations[idx] = updated;
      return updated;
    },
  );
}
