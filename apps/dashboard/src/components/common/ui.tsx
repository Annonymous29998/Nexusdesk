import { type ReactNode } from 'react';
import { DeviceStatus, LogSeverity, SessionStatus, UserRole } from '@nexusdesk/types';
import { cn } from '@/lib/utils';

const statusTag: Record<DeviceStatus, { label: string; className: string }> = {
  [DeviceStatus.Online]: { label: 'ONLINE', className: 'tui-tag-ok' },
  [DeviceStatus.Offline]: { label: 'OFFLINE', className: 'tui-tag-exit' },
  [DeviceStatus.Pending]: { label: 'PENDING', className: 'tui-tag-info' },
  [DeviceStatus.Disabled]: { label: 'DISABLED', className: 'text-muted-foreground' },
  [DeviceStatus.Updating]: { label: 'UPDATING', className: 'tui-tag-info' },
  [DeviceStatus.Error]: { label: 'ERROR', className: 'tui-tag-err' },
};

export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  const tag = statusTag[status];
  return (
    <span className={cn('tui-tag font-mono text-[11px]', tag.className)}>
      [ {tag.label} ]
    </span>
  );
}

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const isBad = status === SessionStatus.Failed || status === SessionStatus.TimedOut;
  const isGood = status === SessionStatus.Active;
  return (
    <span
      className={cn(
        'tui-tag font-mono text-[11px] uppercase',
        isGood ? 'tui-tag-ok' : isBad ? 'tui-tag-err' : 'tui-tag-info',
      )}
    >
      [ {status.replace(/_/g, ' ')} ]
    </span>
  );
}

export function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span className="tui-tag font-mono text-[11px] text-accent">
      [ {role.toUpperCase()} ]
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: LogSeverity }) {
  const map: Record<LogSeverity, string> = {
    [LogSeverity.Debug]: 'text-muted-foreground',
    [LogSeverity.Info]: 'tui-tag-info',
    [LogSeverity.Warn]: 'tui-tag-info',
    [LogSeverity.Error]: 'tui-tag-err',
    [LogSeverity.Critical]: 'tui-tag-err',
  };
  return (
    <span className={cn('tui-tag font-mono text-[11px]', map[severity])}>
      [ {severity.toUpperCase()} ]
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="tui-box flex flex-col items-start px-4 py-10 font-mono">
      <p className="tui-tag tui-tag-info">[ INFO ]</p>
      <h3 className="mt-2 text-sm text-primary">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-xs text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="font-mono">
        <p className="text-[10px] text-accent">
          {'*> NexusDesk control panel *'}
        </p>
        <h1 className="mt-1 text-xl text-primary sm:text-2xl">
          <span className="text-muted-foreground"># </span>
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            <span className="tui-tag tui-tag-info">[ INFO ]</span> {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={cn('nd-stat font-mono', accent && 'nd-stat-accent')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider text-accent">{label}</p>
        {accent ? <span className="tui-tag tui-tag-ok">[ LIVE ]</span> : null}
      </div>
      <p className="mt-2 text-2xl tabular-nums text-primary">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="tui-box flex items-center gap-3 px-4 py-10 font-mono text-sm text-muted-foreground">
      <span className="tui-tag tui-tag-info animate-pulse-soft">[ INFO ]</span>
      {label}
    </div>
  );
}

export function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="tui-box overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left font-mono text-xs">
          <thead className="border-b border-border text-[10px] uppercase tracking-wider text-accent">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">{children}</tbody>
        </table>
      </div>
    </div>
  );
}
