import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DeviceStatus, type Device } from '@nexusdesk/types';
import { listDevices, getDevice, updateDevice, deleteDevice } from '@/api/devices';
import { useAuthStore } from '@/stores/auth';

export function useOrgId() {
  return useAuthStore((s) => s.organizationId);
}

export function useDevices(filters: {
  search?: string;
  status?: string;
  platform?: string;
  page?: number;
}) {
  const orgId = useOrgId();
  const search = filters.search;
  const status = filters.status;
  const platform = filters.platform;
  const page = filters.page;
  return useQuery({
    queryKey: ['devices', orgId, search, status, platform, page],
    enabled: Boolean(orgId) && !String(orgId).startsWith('org_demo_'),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
    queryFn: () =>
      listDevices({
        orgId: orgId!,
        search,
        status,
        platform,
        page,
      }),
  });
}

export function useDevice(deviceId: string | undefined) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ['device', orgId, deviceId],
    enabled: Boolean(orgId && deviceId),
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    queryFn: () => getDevice(orgId!, deviceId!),
  });
}

export function useUpdateDevice() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      deviceId,
      patch,
    }: {
      deviceId: string;
      patch: Partial<Pick<Device, 'name' | 'tags' | 'status'>>;
    }) => updateDevice(orgId!, deviceId, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['devices'] });
      void qc.invalidateQueries({ queryKey: ['device'] });
    },
  });
}

export function useDeleteDevice() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) => deleteDevice(orgId!, deviceId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['devices'] }),
  });
}

export function deviceStatusLabel(status: DeviceStatus): string {
  return status.replace(/_/g, ' ');
}
