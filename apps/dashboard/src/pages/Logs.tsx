import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@nexusdesk/ui';
import { listActivity, listAuditLogs } from '@/api/analytics';
import { DataTable, LoadingBlock, PageHeader, SeverityBadge } from '@/components/common/ui';
import { useOrgId } from '@/hooks/useDevices';
import { formatDate } from '@/lib/utils';

export function LogsPage() {
  const orgId = useOrgId();
  const [tab, setTab] = useState<'activity' | 'audit'>('activity');

  const activity = useQuery({
    queryKey: ['activity-full', orgId],
    enabled: Boolean(orgId) && tab === 'activity',
    queryFn: () => listActivity(orgId!, 1, 100),
  });

  const audit = useQuery({
    queryKey: ['audit-full', orgId],
    enabled: Boolean(orgId) && tab === 'audit',
    queryFn: () => listAuditLogs(orgId!, 1, 100),
  });

  return (
    <div>
      <PageHeader
        title="Logs"
        description="Activity stream and immutable audit trail"
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={tab === 'activity' ? 'primary' : 'outline'}
              onClick={() => setTab('activity')}
            >
              Activity
            </Button>
            <Button
              size="sm"
              variant={tab === 'audit' ? 'primary' : 'outline'}
              onClick={() => setTab('audit')}
            >
              Audit
            </Button>
          </div>
        }
      />

      {tab === 'activity' ? (
        activity.isLoading ? (
          <LoadingBlock />
        ) : (
          <DataTable headers={['When', 'Severity', 'Action', 'Message', 'Actor']}>
            {(activity.data?.items ?? []).map((row) => (
              <tr key={row.id} className="hover:bg-muted/40">
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {formatDate(row.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <SeverityBadge severity={row.severity} />
                </td>
                <td className="px-4 py-3 font-mono text-xs">{row.action}</td>
                <td className="px-4 py-3">{row.message}</td>
                <td className="px-4 py-3 capitalize text-muted-foreground">{row.actorType}</td>
              </tr>
            ))}
          </DataTable>
        )
      ) : audit.isLoading ? (
        <LoadingBlock />
      ) : (
        <DataTable headers={['When', 'Severity', 'Action', 'Actor', 'Resource', 'Request']}>
          {(audit.data?.items ?? []).map((row) => (
            <tr key={row.id} className="hover:bg-muted/40">
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                {formatDate(row.createdAt)}
              </td>
              <td className="px-4 py-3">
                <SeverityBadge severity={row.severity} />
              </td>
              <td className="px-4 py-3 font-mono text-xs">{row.action}</td>
              <td className="px-4 py-3">
                <div className="text-sm">{row.actorEmail ?? 'system'}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{row.actorIp}</div>
              </td>
              <td className="px-4 py-3 font-mono text-xs">
                {row.resourceType}
                {row.resourceId ? `:${row.resourceId.slice(0, 8)}` : ''}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                {row.requestId ?? '—'}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
