import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchAnalytics } from '@/api/analytics';
import { LoadingBlock, PageHeader, StatCard } from '@/components/common/ui';
import { useOrgId } from '@/hooks/useDevices';

const PIE_COLORS = ['#39ff14', '#22d3ee', '#fbbf24', '#f87171', '#a3e635', '#67e8f9'];

export function AnalyticsPage() {
  const orgId = useOrgId();
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['analytics', orgId],
    enabled: Boolean(orgId),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    queryFn: () => fetchAnalytics(orgId!),
  });

  if (isLoading) return <LoadingBlock label="Loading analytics…" />;
  if (isError) {
    return (
      <div className="tui-box p-4 font-mono text-xs">
        <p className="tui-tag tui-tag-err">[ EXIT ]</p>
        <p className="mt-2 text-destructive">
          Analytics failed: {error instanceof Error ? error.message : 'unknown error'}
        </p>
        <button
          type="button"
          className="mt-4 border border-primary px-3 py-1.5 text-primary hover:bg-primary/10"
          onClick={() => void refetch()}
        >
          retry
        </button>
      </div>
    );
  }
  if (!data) return null;

  const chartTick = { fontSize: 10, fill: 'hsl(185 85% 55%)' };
  const tooltipStyle = {
    borderRadius: 0,
    border: '1px solid hsl(120 25% 18%)',
    background: 'hsl(120 10% 6%)',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 11,
    color: 'hsl(120 60% 72%)',
  };

  return (
    <div>
      <PageHeader
        title="Analytics"
        description="Usage trends from live organization telemetry"
        actions={
          <button
            type="button"
            className="border border-border px-3 py-1.5 font-mono text-[11px] text-accent hover:border-primary hover:text-primary"
            onClick={() => void refetch()}
          >
            {isFetching ? 'refreshing…' : 'refresh'}
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Devices online" value={`${data.devicesOnline}/${data.devicesTotal}`} accent />
        <StatCard label="Active sessions" value={data.activeSessions} />
        <StatCard label="Sessions today" value={data.sessionsToday} />
        <StatCard label="Avg session" value={`${data.avgSessionMinutes}m`} />
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <section className="tui-box">
          <div className="tui-box-title">sessions_and_bandwidth · 14d</div>
          <div className="h-72 p-2">
            {data.series.length === 0 ? (
              <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
                <span className="tui-tag tui-tag-info">[ INFO ]</span>&nbsp;no series data
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minHeight={240}>
                <AreaChart data={data.series}>
                  <CartesianGrid strokeDasharray="2 4" stroke="hsl(120 25% 18%)" />
                  <XAxis dataKey="date" tick={chartTick} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis yAxisId="left" tick={chartTick} width={28} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tick={chartTick} width={32} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="sessions"
                    stroke="#39ff14"
                    fill="#39ff1433"
                    strokeWidth={2}
                    name="sessions"
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="bytesGb"
                    stroke="#22d3ee"
                    fill="#22d3ee22"
                    strokeWidth={2}
                    name="GB est."
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="tui-box">
          <div className="tui-box-title">devices_online · 14d</div>
          <div className="h-72 p-2">
            <ResponsiveContainer width="100%" height="100%" minHeight={240}>
              <BarChart data={data.series}>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(120 25% 18%)" />
                <XAxis dataKey="date" tick={chartTick} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={chartTick} width={28} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="devicesOnline" fill="#39ff14" name="online" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="tui-box">
          <div className="tui-box-title">by_platform</div>
          <div className="h-64 p-2">
            {data.byPlatform.length === 0 ? (
              <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
                <span className="tui-tag tui-tag-info">[ INFO ]</span>&nbsp;no devices
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minHeight={200}>
                <PieChart>
                  <Pie data={data.byPlatform} dataKey="count" nameKey="platform" innerRadius={50} outerRadius={85}>
                    {data.byPlatform.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="tui-box">
          <div className="tui-box-title">by_status</div>
          <div className="h-64 p-2">
            <ResponsiveContainer width="100%" height="100%" minHeight={200}>
              <BarChart data={data.byStatus} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(120 25% 18%)" />
                <XAxis type="number" tick={chartTick} allowDecimals={false} />
                <YAxis type="category" dataKey="status" tick={chartTick} width={72} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#22d3ee" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}
