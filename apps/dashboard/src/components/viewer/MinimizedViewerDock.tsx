import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@nexusdesk/ui';
import { Maximize2, Monitor, Wifi, WifiOff, X } from 'lucide-react';
import { endSession } from '@/api/sessions';
import { useOrgId } from '@/hooks/useDevices';
import { ScreenStreamClient, type StreamStatus } from '@/lib/screen-stream';
import { useActiveViewerStore } from '@/stores/active-viewer';

/**
 * Floating mini viewer shown after Minimize — keeps the remote session streaming
 * while the admin uses the rest of the dashboard.
 */
export function MinimizedViewerDock() {
  const navigate = useNavigate();
  const orgId = useOrgId();
  const minimized = useActiveViewerStore((s) => s.minimized);
  const clearMinimized = useActiveViewerStore((s) => s.clearMinimized);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [frameSrc, setFrameSrc] = useState<string | null>(null);
  const clientRef = useRef<ScreenStreamClient | null>(null);

  useEffect(() => {
    if (!minimized) {
      clientRef.current?.close();
      clientRef.current = null;
      setFrameSrc(null);
      setStatus('idle');
      return;
    }

    const client = new ScreenStreamClient({
      sessionId: minimized.sessionId,
      deviceId: minimized.deviceId,
      onStatus: (s) => setStatus(s),
      onFrame: (jpegBase64) => setFrameSrc(`data:image/jpeg;base64,${jpegBase64}`),
    });
    clientRef.current = client;
    client.connect();

    return () => {
      client.close();
      if (clientRef.current === client) clientRef.current = null;
    };
  }, [minimized?.sessionId, minimized?.deviceId]);

  if (!minimized) return null;

  const live = status === 'streaming';

  const restore = () => {
    const { sessionId } = minimized;
    clearMinimized();
    navigate(`/viewer/${sessionId}`);
  };

  const end = () => {
    const { sessionId } = minimized;
    clearMinimized();
    if (orgId) {
      void endSession(orgId, sessionId).finally(() => navigate('/sessions'));
    } else {
      navigate('/sessions');
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[70] w-[min(100vw-2rem,22rem)] overflow-hidden rounded-nd-xl border border-white/15 bg-[hsl(215_32%_8%)] text-slate-100 shadow-2xl animate-slide-in-right">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <Monitor className="h-3.5 w-3.5 shrink-0 text-teal-300" />
        <p className="min-w-0 flex-1 truncate text-xs font-medium">{minimized.deviceName}</p>
        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
          {live ? (
            <Wifi className="h-3 w-3 text-emerald-400" />
          ) : (
            <WifiOff className="h-3 w-3 text-amber-400" />
          )}
          {live ? 'live' : status}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-slate-200 hover:bg-white/10"
          aria-label="Restore session"
          onClick={restore}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-slate-200 hover:bg-white/10"
          aria-label="End session"
          onClick={end}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <button
        type="button"
        className="relative block w-full bg-black/50 text-left"
        onClick={restore}
        aria-label="Restore full viewer"
      >
        {frameSrc ? (
          <img
            src={frameSrc}
            alt="Remote screen preview"
            className="aspect-video w-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="flex aspect-video items-center justify-center text-xs text-slate-400">
            Waiting for screen…
          </div>
        )}
      </button>
    </div>
  );
}
