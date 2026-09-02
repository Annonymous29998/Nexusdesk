import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Modal, ModalBody, useToast } from '@nexusdesk/ui';
import { DeviceStatus } from '@nexusdesk/types';
import { DeviceStatusBadge, LoadingBlock, PageHeader, StatCard } from '@/components/common/ui';
import { DeviceMetricsPanel } from '@/components/devices/DeviceMetricsPanel';
import { useDeleteDevice, useDevice } from '@/hooks/useDevices';
import { useSessions, useStartSession } from '@/hooks/useSessions';
import { SessionRow } from '@/components/sessions/SessionRow';
import { DataTable } from '@/components/common/ui';
import { formatDate, formatRelative } from '@/lib/utils';

export function DeviceDetailPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { data: device, isLoading } = useDevice(deviceId);
  const sessions = useSessions({ deviceId });
  const startSession = useStartSession();
  const deleteDevice = useDeleteDevice();

  if (isLoading) return <LoadingBlock />;
  if (!device) return <p className="text-sm text-muted-foreground">Device not found.</p>;

  const onConfirmDelete = async () => {
    try {
      await deleteDevice.mutateAsync(device.id);
      toast({
        title: 'Device deleted',
        description: `${device.name} was removed from your organization.`,
        variant: 'success',
      });
      navigate('/devices');
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
        title={device.name}
        description={device.hostname}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/devices')}>
              Back
            </Button>
            <Button
              variant="destructive"
              disabled={deleteDevice.isPending}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
            <Button
              disabled={device.status !== DeviceStatus.Online || deleteDevice.isPending}
              loading={startSession.isPending}
              onClick={() => {
                void startSession.mutateAsync({ deviceId: device.id }).then((s) => {
                  navigate(`/viewer/${s.id}`);
                });
              }}
            >
              Start remote session
            </Button>
          </>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <DeviceStatusBadge status={device.status} />
        <span className="text-sm text-muted-foreground">Agent {device.agentVersion}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Platform" value={device.platform} />
        <StatCard label="OS" value={device.osVersion} />
        <StatCard label="Last IP" value={device.lastIp ?? '—'} />
        <StatCard label="Last seen" value={formatRelative(device.lastSeenAt)} />
      </div>

      <DeviceMetricsPanel metrics={device.metadata?.metrics} />

      <section className="mt-6 rounded-nd-xl border border-border bg-card/80 p-4">
        <h2 className="font-display text-lg font-semibold">Inventory</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Device ID</dt>
            <dd className="mt-1 font-mono text-xs">{device.id}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Enrolled</dt>
            <dd className="mt-1">{formatDate(device.createdAt)}</dd>
          </div>
          {device.metadata?.cpuModel ? (
            <div>
              <dt className="text-muted-foreground">CPU</dt>
              <dd className="mt-1">{device.metadata.cpuModel}</dd>
            </div>
          ) : null}
          {device.metadata?.arch ? (
            <div>
              <dt className="text-muted-foreground">Architecture</dt>
              <dd className="mt-1">{device.metadata.arch}</dd>
            </div>
          ) : null}
          {device.metadata?.totalMemoryMb ? (
            <div>
              <dt className="text-muted-foreground">Installed RAM</dt>
              <dd className="mt-1">{device.metadata.totalMemoryMb} MB</dd>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">Tags</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {device.tags.map((t) => (
                <span key={t} className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
                  {t}
                </span>
              ))}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg font-semibold">Sessions for this device</h2>
        <DataTable headers={['Session', 'Device', 'User', 'Status', 'Mode', 'Started', 'Ended', 'Duration']}>
          {(sessions.data?.items ?? []).map((s) => (
            <SessionRow key={s.id} session={s} deviceName={device.name} />
          ))}
        </DataTable>
      </section>

      <Modal
        open={confirmDelete}
        onClose={() => {
          if (!deleteDevice.isPending) setConfirmDelete(false);
        }}
        title="Delete device"
      >
        <ModalBody>
          <div className="space-y-4 font-mono text-sm">
            <p className="text-muted-foreground">
              Remove <span className="text-primary">{device.name}</span> (
              <span className="text-foreground">{device.hostname}</span>) from this organization? You
              can enroll it again later with a new support link.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-none font-mono"
                disabled={deleteDevice.isPending}
                onClick={() => setConfirmDelete(false)}
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
