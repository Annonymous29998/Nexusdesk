import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@nexusdesk/ui';
import { DeviceStatus } from '@nexusdesk/types';
import { DeviceStatusBadge, LoadingBlock, PageHeader, StatCard } from '@/components/common/ui';
import { useDevice } from '@/hooks/useDevices';
import { useSessions, useStartSession } from '@/hooks/useSessions';
import { SessionRow } from '@/components/sessions/SessionRow';
import { DataTable } from '@/components/common/ui';
import { formatDate, formatRelative } from '@/lib/utils';

export function DeviceDetailPage() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { data: device, isLoading } = useDevice(deviceId);
  const sessions = useSessions({ deviceId });
  const startSession = useStartSession();

  if (isLoading) return <LoadingBlock />;
  if (!device) return <p className="text-sm text-muted-foreground">Device not found.</p>;

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
              disabled={device.status !== DeviceStatus.Online}
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
    </div>
  );
}
