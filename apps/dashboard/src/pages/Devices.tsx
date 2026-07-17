import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Select } from '@nexusdesk/ui';
import { DevicePlatform, DeviceStatus, type Device } from '@nexusdesk/types';
import { DeviceCard } from '@/components/devices/DeviceCard';
import { EmptyState, LoadingBlock, PageHeader } from '@/components/common/ui';
import { useDevices } from '@/hooks/useDevices';
import { useStartSession } from '@/hooks/useSessions';

export function DevicesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [platform, setPlatform] = useState('');
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useDevices({
    search: search || undefined,
    status: status || undefined,
    platform: platform || undefined,
  });
  const startSession = useStartSession();

  const onConnect = async (device: Device) => {
    setConnectingId(device.id);
    try {
      const session = await startSession.mutateAsync({ deviceId: device.id });
      navigate(`/viewer/${session.id}`);
    } finally {
      setConnectingId(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Devices"
        description="Managed computers with live agent status"
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Input
          placeholder="Search name, hostname, tags…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          placeholder="All statuses"
          options={[
            { value: '', label: 'All statuses' },
            ...Object.values(DeviceStatus).map((s) => ({ value: s, label: s.replace(/_/g, ' ') })),
          ]}
        />
        <Select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          placeholder="All platforms"
          options={[
            { value: '', label: 'All platforms' },
            ...Object.values(DevicePlatform).map((p) => ({ value: p, label: p })),
          ]}
        />
      </div>

      {isLoading ? (
        <LoadingBlock label="Loading devices…" />
      ) : isError ? (
        <EmptyState
          title="Could not load devices"
          description={error instanceof Error ? error.message : 'Check that you are signed in to the live API.'}
        />
      ) : !data?.items.length ? (
        <EmptyState
          title="No devices match"
          description="Adjust filters or enroll an agent on a computer."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.items.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onConnect={onConnect}
              connecting={connectingId === device.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
