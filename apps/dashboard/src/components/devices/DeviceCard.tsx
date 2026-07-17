import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { Button } from '@nexusdesk/ui';
import { DevicePlatform, DeviceStatus, type Device } from '@nexusdesk/types';
import { DeviceStatusBadge } from '@/components/common/ui';
import { cn, formatRelative } from '@/lib/utils';

function platformLabel(platform: DevicePlatform) {
  switch (platform) {
    case DevicePlatform.Windows:
      return 'windows';
    case DevicePlatform.MacOS:
      return 'macos';
    case DevicePlatform.Linux:
      return 'linux';
    default:
      return 'unknown';
  }
}

export function DeviceCard({
  device,
  onConnect,
  connecting,
}: {
  device: Device;
  onConnect?: (device: Device) => void;
  connecting?: boolean;
}) {
  const canConnect = device.status === DeviceStatus.Online;

  return (
    <article
      className={cn(
        'tui-box flex flex-col font-mono text-xs',
        canConnect && 'border-primary/40',
      )}
    >
      <div className="tui-box-title flex items-center justify-between gap-2">
        <span className="truncate text-primary">{device.name}</span>
        <DeviceStatusBadge status={device.status} />
      </div>

      <div className="space-y-1.5 p-3">
        <p className="text-muted-foreground">
          hostname <span className="text-foreground">{device.hostname}</span>
        </p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          <p>
            <span className="text-accent">platform</span>{' '}
            <span className="text-foreground">{platformLabel(device.platform)}</span>
          </p>
          <p>
            <span className="text-accent">agent</span>{' '}
            <span className="text-foreground">{device.agentVersion || '?'}</span>
          </p>
          <p className="col-span-2">
            <span className="text-accent">last_seen</span>{' '}
            <span className="text-foreground">{formatRelative(device.lastSeenAt)}</span>
          </p>
        </div>
        {device.tags.length > 0 ? (
          <p className="text-muted-foreground">
            tags [{device.tags.join(', ')}]
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-border p-2">
        <Button
          size="sm"
          className="h-8 rounded-none font-mono text-xs"
          disabled={!canConnect}
          loading={connecting}
          onClick={() => onConnect?.(device)}
        >
          <Play className="h-3 w-3" />
          connect
        </Button>
        <Link
          to={`/devices/${device.id}`}
          className="inline-flex h-8 items-center border border-border px-3 text-[11px] text-accent hover:border-primary hover:text-primary"
        >
          details
        </Link>
      </div>
    </article>
  );
}
