import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Modal, ModalBody, Select, useToast } from '@nexusdesk/ui';
import { DevicePlatform, DeviceStatus, type Device } from '@nexusdesk/types';
import { DeviceCard } from '@/components/devices/DeviceCard';
import { EmptyState, LoadingBlock, PageHeader } from '@/components/common/ui';
import { useDeleteDevice, useDevices } from '@/hooks/useDevices';
import { useStartSession } from '@/hooks/useSessions';

export function DevicesPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [platform, setPlatform] = useState('');
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Device | null>(null);

  const { data, isLoading, isError, error } = useDevices({
    search: search || undefined,
    status: status || undefined,
    platform: platform || undefined,
  });
  const startSession = useStartSession();
  const deleteDevice = useDeleteDevice();

  const onConnect = async (device: Device) => {
    setConnectingId(device.id);
    try {
      const session = await startSession.mutateAsync({ deviceId: device.id });
      navigate(`/viewer/${session.id}`);
    } catch (err) {
      toast({
        title: 'Could not connect',
        description: err instanceof Error ? err.message : 'Session start failed. Check the agent is running on the PC.',
        variant: 'error',
      });
    } finally {
      setConnectingId(null);
    }
  };

  const onConfirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteDevice.mutateAsync(pendingDelete.id);
      toast({
        title: 'Device deleted',
        description: `${pendingDelete.name} was removed from your organization.`,
        variant: 'success',
      });
      setPendingDelete(null);
    } catch (err) {
      toast({
        title: 'Could not delete device',
        description: err instanceof Error ? err.message : 'Delete failed. Try again.',
        variant: 'error',
      });
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
              onDelete={setPendingDelete}
              connecting={connectingId === device.id}
              deleting={deleteDevice.isPending && pendingDelete?.id === device.id}
            />
          ))}
        </div>
      )}

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => {
          if (!deleteDevice.isPending) setPendingDelete(null);
        }}
        title="Delete device"
      >
        <ModalBody>
          <div className="space-y-4 font-mono text-sm">
            <p className="text-muted-foreground">
              Remove{' '}
              <span className="text-primary">{pendingDelete?.name}</span>
              {pendingDelete?.hostname ? (
                <>
                  {' '}
                  (<span className="text-foreground">{pendingDelete.hostname}</span>)
                </>
              ) : null}{' '}
              from this organization? You can enroll it again later with a new support link.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-none font-mono"
                disabled={deleteDevice.isPending}
                onClick={() => setPendingDelete(null)}
              >
                cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="rounded-none font-mono"
                loading={deleteDevice.isPending}
                onClick={() => void onConfirmDelete()}
              >
                delete
              </Button>
            </div>
          </div>
        </ModalBody>
      </Modal>
    </div>
  );
}
