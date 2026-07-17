import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Select } from '@nexusdesk/ui';
import { SessionStatus } from '@nexusdesk/types';
import { listUsers } from '@/api/users';
import { listDevices } from '@/api/devices';
import { DataTable, EmptyState, LoadingBlock, PageHeader } from '@/components/common/ui';
import { SessionRow } from '@/components/sessions/SessionRow';
import { useSessions } from '@/hooks/useSessions';
import { useOrgId } from '@/hooks/useDevices';

export function SessionsPage() {
  const orgId = useOrgId();
  const [status, setStatus] = useState('');
  const sessions = useSessions({ status: status || undefined });

  const devices = useQuery({
    queryKey: ['devices-map', orgId],
    enabled: Boolean(orgId),
    queryFn: () => listDevices({ orgId: orgId!, pageSize: 100 }),
  });
  const users = useQuery({
    queryKey: ['users-map', orgId],
    enabled: Boolean(orgId),
    queryFn: () => listUsers({ orgId: orgId!, pageSize: 100 }),
  });

  const deviceName = (id: string) => devices.data?.items.find((d) => d.id === id)?.name;
  const userName = (id: string) => users.data?.items.find((u) => u.id === id)?.displayName;

  return (
    <div>
      <PageHeader
        title="Sessions"
        description="Remote connection history and live sessions"
        actions={
          <div className="w-48">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[
                { value: '', label: 'All statuses' },
                ...Object.values(SessionStatus).map((s) => ({
                  value: s,
                  label: s.replace(/_/g, ' '),
                })),
              ]}
            />
          </div>
        }
      />

      {sessions.isLoading ? (
        <LoadingBlock />
      ) : !sessions.data?.items.length ? (
        <EmptyState title="No sessions yet" description="Start a remote session from a device." />
      ) : (
        <DataTable headers={['Session', 'Device', 'User', 'Status', 'Mode', 'Started', 'Ended', 'Duration']}>
          {sessions.data.items.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              deviceName={deviceName(s.deviceId)}
              userName={userName(s.initiatedByUserId)}
            />
          ))}
        </DataTable>
      )}
    </div>
  );
}
