import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@nexusdesk/ui';
import { NotificationStatus } from '@nexusdesk/types';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '@/api/analytics';
import { EmptyState, LoadingBlock, PageHeader } from '@/components/common/ui';
import { useOrgId } from '@/hooks/useDevices';
import { formatRelative } from '@/lib/utils';

export function NotificationsPage() {
  const orgId = useOrgId();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ['notifications', orgId],
    enabled: Boolean(orgId),
    queryFn: () => listNotifications(orgId!),
  });

  const markOne = useMutation({
    mutationFn: (id: string) => markNotificationRead(orgId!, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(orgId!),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="In-app alerts for devices, sessions, and security events"
        actions={
          <Button variant="outline" loading={markAll.isPending} onClick={() => markAll.mutate()}>
            Mark all read
          </Button>
        }
      />

      {isLoading ? (
        <LoadingBlock />
      ) : data.length === 0 ? (
        <EmptyState title="Inbox zero" description="No notifications for this organization." />
      ) : (
        <ul className="space-y-3">
          {data.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className="flex w-full items-start gap-3 rounded-nd-xl border border-border bg-card/80 p-4 text-left shadow-sm transition hover:border-primary/35"
                onClick={() => {
                  if (n.status === NotificationStatus.Unread) markOne.mutate(n.id);
                  if (n.href) navigate(n.href);
                }}
              >
                <span
                  className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                    n.status === NotificationStatus.Unread ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-medium">{n.title}</h3>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelative(n.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
