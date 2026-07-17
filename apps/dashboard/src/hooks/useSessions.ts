import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { endSession, listSessions, startSession } from '@/api/sessions';
import { RemoteConnectionMode } from '@nexusdesk/types';
import { useAuthStore } from '@/stores/auth';
import { useOrgId } from '@/hooks/useDevices';

export function useSessions(filters: { status?: string; deviceId?: string; page?: number } = {}) {
  const orgId = useOrgId();
  const status = filters.status;
  const deviceId = filters.deviceId;
  const page = filters.page;
  return useQuery({
    queryKey: ['sessions', orgId, status, deviceId, page],
    enabled: Boolean(orgId) && !String(orgId).startsWith('org_demo_'),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
    queryFn: () =>
      listSessions({
        orgId: orgId!,
        status,
        deviceId,
        page,
      }),
  });
}

export function useStartSession() {
  const orgId = useOrgId();
  const userId = useAuthStore((s) => s.user?.id);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { deviceId: string; mode?: RemoteConnectionMode }) =>
      startSession(orgId!, input, userId!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sessions'] });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

export function useEndSession() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => endSession(orgId!, sessionId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
}
