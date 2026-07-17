import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowRight, Monitor, Users, Video } from 'lucide-react';
import { fetchAnalytics, listActivity } from '@/api/analytics';
import { EmptyState, LoadingBlock, PageHeader, SeverityBadge, StatCard } from '@/components/common/ui';
import { useDevices } from '@/hooks/useDevices';
import { useSessions } from '@/hooks/useSessions';
import { useOrgId } from '@/hooks/useDevices';
import { formatRelative } from '@/lib/utils';
import { DeviceStatus, SessionStatus } from '@nexusdesk/types';

const ACTIVE_SESSION_STATUSES = new Set<SessionStatus>([
  SessionStatus.Pending,
  SessionStatus.Connecting,
  SessionStatus.Active,
  SessionStatus.Paused,
]);

export function DashboardPage() {
  const orgId = useOrgId();
  const analytics = useQuery({
    queryKey: ['analytics', orgId],
    enabled: Boolean(orgId),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    queryFn: () => fetchAnalytics(orgId!),
  });
  const devices = useDevices({});
  const sessions = useSessions({});
  const activity = useQuery({
    queryKey: ['activity', orgId],
    enabled: Boolean(orgId),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    queryFn: () => listActivity(orgId!, 1, 6),
  });

  const deviceItems = devices.data?.items ?? [];
  const sessionItems = sessions.data?.items ?? [];

  const onlineDevices = useMemo(
    () => deviceItems.filter((d) => d.status === DeviceStatus.Online),
    [deviceItems],
  );

  const devicesTotal = devices.data?.total ?? deviceItems.length;
  const devicesOnline = onlineDevices.length;
  const activeSessions =
    sessionItems.filter((s) => ACTIVE_SESSION_STATUSES.has(s.status)).length ||
    (analytics.data?.activeSessions ?? 0);

  const startOfToday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);

  const sessionsTodayFromList = sessionItems.filter(
    (s) => new Date(s.createdAt).getTime() >= startOfToday,
  ).length;
  const sessionsToday = analytics.data?.sessionsToday ?? sessionsTodayFromList;
  const avgSessionMinutes = analytics.data?.avgSessionMinutes ?? 0;
  const usersActive = analytics.data?.usersActive ?? 0;

  if (devices.isLoading && !devices.data) {
    return <LoadingBlock label="Loading overview…" />;
  }

  const chartSeries = analytics.data?.series ?? [];

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Live posture across devices, sessions, and operators"
        actions={
          <Link
            to="/devices"
            className="inline-flex h-9 items-center gap-2 border border-primary bg-primary/15 px-3 font-mono text-xs font-medium text-primary hover:bg-primary/25"
          >
            ./devices <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Devices online"
          value={`${devicesOnline}/${devicesTotal}`}
          hint="Across this organization"
          accent
        />
        <StatCard label="Active sessions" value={activeSessions} hint="Control + view-only" />
        <StatCard
          label="Sessions today"
          value={sessionsToday}
          hint={`Avg ${avgSessionMinutes} min`}
        />
        <StatCard label="Active users" value={usersActive} hint="Seats currently enabled" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="tui-box xl:col-span-2">
          <div className="tui-box-title flex items-center justify-between">
            <span>session_volume</span>
            <Link to="/analytics" className="text-primary hover:underline">
              ./analytics
            </Link>
          </div>
          <div className="p-3">
          <div className="h-64">
            {analytics.isLoading && !analytics.data ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading chart…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartSeries}>
                  <defs>
                    <linearGradient id="sessionsFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(120 90% 48%)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(120 90% 48%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(120 25% 18%)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(185 85% 55%)' }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(185 85% 55%)' }} width={28} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 0,
                      border: '1px solid hsl(120 25% 18%)',
                      background: 'hsl(120 10% 6%)',
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 11,
                      color: 'hsl(120 60% 72%)',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="sessions"
                    stroke="hsl(120 90% 48%)"
                    fill="url(#sessionsFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          </div>
        </section>

        <section className="tui-box">
          <div className="tui-box-title">quick_links</div>
          <ul className="space-y-0 p-2">
            {[
              { to: '/devices', icon: Monitor, label: 'Browse devices', hint: `${devicesOnline} online` },
              { to: '/sessions', icon: Video, label: 'Session history', hint: `${sessions.data?.total ?? 0} total` },
              { to: '/users', icon: Users, label: 'Manage users', hint: 'roles' },
            ].map((item, i) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="flex items-center gap-2 px-2 py-2 text-xs transition hover:bg-muted hover:text-primary"
                >
                  <span className="text-accent">[{i + 1}]</span>
                  <item.icon className="h-3.5 w-3.5 opacity-70" />
                  <span className="flex-1">{item.label}</span>
                  <span className="text-muted-foreground">{item.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between font-mono text-xs">
          <h2 className="text-accent">── recent_activity ──</h2>
          <Link to="/logs" className="text-primary hover:underline">
            ./logs
          </Link>
        </div>
        {activity.data?.items.length ? (
          <ul className="tui-box divide-y divide-border font-mono text-xs">
            {activity.data.items.map((item) => (
              <li key={item.id} className="flex items-start gap-3 px-3 py-2.5">
                <SeverityBadge severity={item.severity} />
                <div className="min-w-0 flex-1">
                  <p className="text-foreground">{item.message}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{item.action}</p>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">{formatRelative(item.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No recent activity" description="Sessions and device events will appear here." />
        )}
      </section>
    </div>
  );
}
