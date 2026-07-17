import { API_ROUTES, buildApiPath } from '@nexusdesk/shared';
import type { Device, Paginated } from '@nexusdesk/types';
import { apiRequest, delay, withDemoFallback } from '@/api/client';
import { mockDevices, nowIso } from '@/lib/mock-data';

export interface DeviceListParams {
  orgId: string;
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  platform?: string;
  tag?: string;
}

function filterDevices(params: DeviceListParams): Paginated<Device> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  let items = [...mockDevices];

  if (params.search) {
    const q = params.search.toLowerCase();
    items = items.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.hostname.toLowerCase().includes(q) ||
        d.tags.some((t) => t.includes(q)),
    );
  }
  if (params.status) items = items.filter((d) => d.status === params.status);
  if (params.platform) items = items.filter((d) => d.platform === params.platform);
  if (params.tag) items = items.filter((d) => d.tags.includes(params.tag!));

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

export async function listDevices(params: DeviceListParams): Promise<Paginated<Device>> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.platform) query.set('platform', params.platform);
  if (params.tag) query.set('tag', params.tag);
  const qs = query.toString();
  const path =
    buildApiPath(API_ROUTES.devices.root, { orgId: params.orgId }) + (qs ? `?${qs}` : '');

  return withDemoFallback(
    () => apiRequest<Paginated<Device>>(path),
    async () => {
      await delay();
      return filterDevices(params);
    },
  );
}

export async function getDevice(orgId: string, deviceId: string): Promise<Device> {
  const path = buildApiPath(API_ROUTES.devices.byId, { orgId, deviceId });
  return withDemoFallback(
    () => apiRequest<Device>(path),
    async () => {
      await delay();
      const device = mockDevices.find((d) => d.id === deviceId);
      if (!device) throw new Error('Device not found');
      return device;
    },
  );
}

export async function updateDevice(
  orgId: string,
  deviceId: string,
  patch: Partial<Pick<Device, 'name' | 'tags' | 'status'>>,
): Promise<Device> {
  const path = buildApiPath(API_ROUTES.devices.byId, { orgId, deviceId });
  return withDemoFallback(
    () => apiRequest<Device>(path, { method: 'PATCH', body: patch }),
    async () => {
      await delay();
      const idx = mockDevices.findIndex((d) => d.id === deviceId);
      if (idx < 0) throw new Error('Device not found');
      const current = mockDevices[idx]!;
      const updated = { ...current, ...patch, updatedAt: nowIso() };
      mockDevices[idx] = updated;
      return updated;
    },
  );
}

export async function deleteDevice(orgId: string, deviceId: string): Promise<void> {
  const path = buildApiPath(API_ROUTES.devices.byId, { orgId, deviceId });
  return withDemoFallback(
    () => apiRequest<void>(path, { method: 'DELETE' }),
    async () => {
      await delay();
      const idx = mockDevices.findIndex((d) => d.id === deviceId);
      if (idx >= 0) mockDevices.splice(idx, 1);
    },
  );
}
