import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@nexusdesk/ui';
import { NotificationStatus } from '@nexusdesk/types';
import { listNotifications, markAllNotificationsRead, markNotificationRead } from '@/api/analytics';
import { formatRelative } from '@/lib/utils';
import { useOrgId } from '@/hooks/useDevices';
import { useUiStore } from '@/stores/ui';

export function NotificationsPanel() {
  const open = useUiStore((s) => s.notificationsOpen);
  const setOpen = useUiStore((s) => s.setNotificationsOpen);
  const orgId = useOrgId();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data = [] } = useQuery({
    queryKey: ['notifications', orgId],
    enabled: Boolean(orgId && open),
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

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/30"
        aria-label="Close notifications"
        onClick={() => setOpen(false)}
      />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-glass animate-slide-in-right">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Notifications</h2>
            <p className="text-xs text-muted-foreground">Organization alerts and activity</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => markAll.mutate()} loading={markAll.isPending}>
            Mark all read
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {data.length === 0 ? (
            <p className="px-2 py-10 text-center text-sm text-muted-foreground">You are all caught up.</p>
          ) : (
            <ul className="space-y-2">
              {data.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="w-full rounded-nd border border-border bg-background/60 p-3 text-left transition hover:border-primary/40"
                    onClick={() => {
                      if (n.status === NotificationStatus.Unread) markOne.mutate(n.id);
                      setOpen(false);
                      if (n.href) navigate(n.href);
                      else navigate('/notifications');
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{n.title}</p>
                      {n.status === NotificationStatus.Unread ? (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">{formatRelative(n.createdAt)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-border p-4">
          <Button variant="secondary" className="w-full" onClick={() => { setOpen(false); navigate('/notifications'); }}>
            View all notifications
          </Button>
        </div>
      </aside>
    </>
  );
}
