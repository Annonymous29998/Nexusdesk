import { Link } from 'react-router-dom';
import type { Session } from '@nexusdesk/types';
import { SessionStatusBadge } from '@/components/common/ui';
import { formatDate, formatDuration } from '@/lib/utils';

export function SessionRow({
  session,
  deviceName,
  userName,
}: {
  session: Session;
  deviceName?: string;
  userName?: string;
}) {
  // Older rows may have null startedAt — fall back to createdAt so the table isn't blank.
  const startedAt = session.startedAt ?? session.createdAt;
  const endedAt = session.endedAt;

  return (
    <tr className="hover:bg-muted/40">
      <td className="px-4 py-3 font-mono text-xs">
        <Link to={`/viewer/${session.id}`} className="text-primary hover:underline">
          {session.id.slice(0, 14)}…
        </Link>
      </td>
      <td className="px-4 py-3">{deviceName ?? session.deviceId.slice(0, 8)}</td>
      <td className="px-4 py-3">{userName ?? session.initiatedByUserId.slice(0, 8)}</td>
      <td className="px-4 py-3">
        <SessionStatusBadge status={session.status} />
      </td>
      <td className="px-4 py-3 capitalize">{session.mode.replace(/_/g, ' ')}</td>
      <td className="px-4 py-3 text-muted-foreground">{formatDate(startedAt)}</td>
      <td className="px-4 py-3 text-muted-foreground">{formatDate(endedAt)}</td>
      <td className="px-4 py-3 tabular-nums">{formatDuration(startedAt, endedAt)}</td>
    </tr>
  );
}
