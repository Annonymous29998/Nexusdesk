import type { DeviceMetrics } from '@nexusdesk/types';
import { StatCard } from '@/components/common/ui';
import { formatRelative } from '@/lib/utils';

function pct(used: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((used / total) * 100));
}

function formatMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function UsageBar({ label, used, total }: { label: string; used: number; total: number }) {
  const percent = pct(used, total);
  const tone =
    percent >= 90 ? 'bg-destructive' : percent >= 75 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground">
          {percent}% · {formatMb(used)} / {formatMb(total)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full transition-all duration-500 ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function DeviceMetricsPanel({ metrics }: { metrics: DeviceMetrics | undefined }) {
  if (!metrics) {
    return (
      <section className="mt-6 rounded-nd-xl border border-border bg-card/80 p-4">
        <h2 className="font-display text-lg font-semibold">Live monitoring</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Waiting for telemetry from the agent. Metrics appear after the next heartbeat (about 30s).
        </p>
      </section>
    );
  }

  const memPct = pct(metrics.memoryUsedMb, metrics.memoryTotalMb);
  const diskPct = pct(metrics.diskUsedMb, metrics.diskTotalMb);

  return (
    <section className="mt-6 rounded-nd-xl border border-border bg-card/80 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Live monitoring</h2>
        <span className="text-xs text-muted-foreground">
          Updated {formatRelative(metrics.sampledAt)}
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="CPU" value={`${metrics.cpuPercent}%`} accent />
        <StatCard label="Memory" value={`${memPct}%`} hint={formatMb(metrics.memoryUsedMb)} accent />
        <StatCard
          label="Disk"
          value={metrics.diskTotalMb > 0 ? `${diskPct}%` : '—'}
          hint={metrics.diskTotalMb > 0 ? formatMb(metrics.diskUsedMb) : 'Not reported'}
          accent
        />
        <StatCard label="Uptime" value={formatUptime(metrics.uptimeSeconds)} accent />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <UsageBar label="Memory" used={metrics.memoryUsedMb} total={metrics.memoryTotalMb} />
        {metrics.diskTotalMb > 0 ? (
          <UsageBar label="Disk" used={metrics.diskUsedMb} total={metrics.diskTotalMb} />
        ) : null}
      </div>

      {metrics.ipAddresses.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Local IPs</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {metrics.ipAddresses.map((ip) => (
              <span key={ip} className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
                {ip}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
