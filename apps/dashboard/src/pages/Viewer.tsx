import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@nexusdesk/ui';
import { Minus, Monitor, Wifi, WifiOff } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getSession, endSession } from '@/api/sessions';
import { getDevice } from '@/api/devices';
import { LoadingBlock } from '@/components/common/ui';
import {
  RemoteScreenFrame,
  type RemoteScreenFrameHandle,
} from '@/components/viewer/RemoteScreenFrame';
import { useOrgId } from '@/hooks/useDevices';
import { RemoteStreamClient, type StreamStatus } from '@/lib/remote-stream';
import { formatDuration } from '@/lib/utils';
import { useActiveViewerStore } from '@/stores/active-viewer';

const STATUS_LABEL: Record<StreamStatus, string> = {
  idle: 'idle',
  connecting: 'connecting',
  authenticating: 'authenticating',
  waiting: 'waiting for screen…',
  streaming: 'live',
  offline: 'device offline',
  disconnected: 'disconnected',
  reconnecting: 'reconnecting',
  error: 'error',
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Map a click onto the letterboxed desktop picture (object-contain), not the black bars. */
function mapPointerToRemote(
  clientX: number,
  clientY: number,
  box: HTMLElement,
  content: { width: number; height: number } | null,
): { x: number; y: number } | null {
  const rect = box.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  if (!content || content.width < 2 || content.height < 2) {
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  }
  const scale = Math.min(rect.width / content.width, rect.height / content.height);
  const drawnW = content.width * scale;
  const drawnH = content.height * scale;
  if (drawnW < 1 || drawnH < 1) return null;
  const ox = rect.left + (rect.width - drawnW) / 2;
  const oy = rect.top + (rect.height - drawnH) / 2;
  return {
    x: clamp01((clientX - ox) / drawnW),
    y: clamp01((clientY - oy) / drawnH),
  };
}

export function ViewerPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const orgId = useOrgId();
  const navigate = useNavigate();
  const minimize = useActiveViewerStore((s) => s.minimize);
  const clearMinimized = useActiveViewerStore((s) => s.clearMinimized);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [detail, setDetail] = useState<string | undefined>();
  const [showScreen, setShowScreen] = useState(false);
  const [webrtcReady, setWebrtcReady] = useState(false);
  const [streamEpoch, setStreamEpoch] = useState(0);
  const [localPointer, setLocalPointer] = useState<{ x: number; y: number } | null>(null);
  const clientRef = useRef<RemoteStreamClient | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<RemoteScreenFrameHandle>(null);
  const pendingStreamRef = useRef<MediaStream | null>(null);
  const gotFirstFrameRef = useRef(false);
  const screenRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef(false);
  const pendingMoveRef = useRef<{
    x: number;
    y: number;
    button: 'left' | 'right' | 'middle';
    buttons: number;
  } | null>(null);
  const moveRafRef = useRef<number | null>(null);
  const minimizingRef = useRef(false);
  const clipboardPullTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyRemoteClipboard = async (text: string) => {
    if (!text) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      /* viewer may block clipboard write without gesture */
    }
  };

  const pasteLocalClipboard = async () => {
    const client = clientRef.current;
    if (!client || status !== 'streaming') return;
    try {
      const text =
        navigator.clipboard && window.isSecureContext ? await navigator.clipboard.readText() : '';
      if (text) client.pasteToRemote(text);
    } catch {
      /* ignore — user can use toolbar paste later if needed */
    }
  };

  /** Mac trackpad/keyboard uses Cmd; remote Windows expects Ctrl. */
  const isModDown = (e: React.KeyboardEvent) => e.ctrlKey || e.metaKey;

  const sendKey = (kind: 'key-down' | 'key-up', e: React.KeyboardEvent) => {
    const client = clientRef.current;
    if (!client || status !== 'streaming') return;

    const mod = isModDown(e);
    const isPaste = mod && (e.key === 'v' || e.key === 'V');
    const isCopy = mod && (e.key === 'c' || e.key === 'C');

    if (kind === 'key-down' && isPaste) {
      e.preventDefault();
      void pasteLocalClipboard();
      return;
    }

    if (kind === 'key-down' && e.key === 'Dead') return;

    if (isCopy) {
      e.preventDefault();
      if (kind === 'key-down') {
        client.sendInput({ kind: 'key-down', key: 'Control' });
        client.sendInput({ kind: 'key-down', key: e.key, code: e.code });
      } else {
        client.sendInput({ kind: 'key-up', key: e.key, code: e.code });
        client.sendInput({ kind: 'key-up', key: 'Control' });
        if (clipboardPullTimerRef.current) clearTimeout(clipboardPullTimerRef.current);
        clipboardPullTimerRef.current = setTimeout(() => {
          clientRef.current?.requestRemoteClipboard();
        }, 250);
      }
      return;
    }

    e.preventDefault();

    // Map Cmd (Mac) → Ctrl on the remote Windows session.
    if (e.key === 'Meta') {
      client.sendInput({ kind, key: 'Control' });
      return;
    }
    if (e.metaKey && !e.ctrlKey && kind === 'key-down') {
      client.sendInput({ kind: 'key-down', key: 'Control' });
    }
    client.sendInput({ kind, key: e.key, code: e.code || undefined });
    if (e.metaKey && !e.ctrlKey && kind === 'key-up' && e.key !== 'Control') {
      client.sendInput({ kind: 'key-up', key: 'Control' });
    }
  };

  const pointerButton = (e: React.PointerEvent): 'left' | 'right' | 'middle' => {
    if (e.buttons & 2 || e.button === 2) return 'right';
    if (e.buttons & 4 || e.button === 1) return 'middle';
    return 'left';
  };

  const flushPointerMoveSync = () => {
    if (moveRafRef.current !== null) {
      cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = null;
    }
    const pending = pendingMoveRef.current;
    const client = clientRef.current;
    if (pending && client && streamingRef.current) {
      client.sendInput({
        kind: 'mouse-move',
        x: pending.x,
        y: pending.y,
        button: pending.button,
        buttons: pending.buttons,
      });
    }
    pendingMoveRef.current = null;
  };

  const flushPointerMove = () => {
    moveRafRef.current = null;
    const pending = pendingMoveRef.current;
    const client = clientRef.current;
    if (!pending || !client || !streamingRef.current) return;
    client.sendInput({
      kind: 'mouse-move',
      x: pending.x,
      y: pending.y,
      button: pending.button,
      buttons: pending.buttons,
    });
  };

  const sendPointer = (e: React.PointerEvent, kind: 'mouse-move' | 'mouse-down' | 'mouse-up') => {
    const client = clientRef.current;
    const el = e.currentTarget as HTMLElement;
    if (!client || !el || status !== 'streaming') return;
    const video = videoRef.current;
    const content =
      webrtcReady && video && video.videoWidth >= 16
        ? { width: video.videoWidth, height: video.videoHeight }
        : (frameRef.current?.getContentSize() ?? null);
    const mapped = mapPointerToRemote(e.clientX, e.clientY, el, content);
    if (!mapped) return;
    const { x, y } = mapped;
    setLocalPointer({ x, y });
    const button = pointerButton(e);
    const buttons = e.buttons;
    if (kind === 'mouse-move') {
      pendingMoveRef.current = { x, y, button, buttons };
      if (moveRafRef.current === null) {
        moveRafRef.current = requestAnimationFrame(flushPointerMove);
      }
      return;
    }
    flushPointerMoveSync();
    client.sendInput({ kind, x, y, button, buttons });
  };

  const session = useQuery({
    queryKey: ['session', orgId, sessionId],
    enabled: Boolean(orgId && sessionId),
    queryFn: () => getSession(orgId!, sessionId!),
    refetchInterval: 4000,
  });

  const deviceId = session.data?.deviceId;
  const device = useQuery({
    queryKey: ['device', orgId, deviceId],
    enabled: Boolean(orgId && deviceId),
    queryFn: () => getDevice(orgId!, deviceId!),
  });

  // Entering the full viewer clears any floating mini preview for the same session.
  useEffect(() => {
    if (!sessionId) return;
    minimizingRef.current = false;
    const current = useActiveViewerStore.getState().minimized;
    if (current?.sessionId === sessionId) {
      clearMinimized();
    }
  }, [sessionId, clearMinimized]);

  useEffect(() => {
    if (!sessionId || !deviceId) return;
    gotFirstFrameRef.current = false;
    pendingStreamRef.current = null;
    setShowScreen(false);
    setWebrtcReady(false);
    setStreamEpoch(0);
    const client = new RemoteStreamClient({
      orgId: orgId!,
      sessionId,
      deviceId,
      onStatus: (s, d) => {
        streamingRef.current = s === 'streaming';
        setStatus((prev) => (prev === s ? prev : s));
        setDetail((prev) => (prev === d ? prev : d));
      },
      onFrame: (jpeg) => {
        frameRef.current?.setFrame(jpeg);
        if (!gotFirstFrameRef.current) {
          gotFirstFrameRef.current = true;
          setShowScreen(true);
        }
      },
      onVideoStream: (stream) => {
        pendingStreamRef.current = stream;
        setStreamEpoch((n) => n + 1);
        const video = videoRef.current;
        if (video && video.srcObject !== stream) {
          video.srcObject = stream;
          void video.play().catch(() => undefined);
        }
      },
      onClipboard: (text) => {
        void applyRemoteClipboard(text);
      },
    });
    clientRef.current = client;
    client.connect();
    return () => {
      if (clipboardPullTimerRef.current) {
        clearTimeout(clipboardPullTimerRef.current);
        clipboardPullTimerRef.current = null;
      }
      client.close({ stopStream: !minimizingRef.current });
      clientRef.current = null;
    };
  }, [sessionId, deviceId, orgId]);

  useEffect(() => {
    const video = videoRef.current;
    const stream = pendingStreamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    void video.play().catch(() => undefined);

    let poll = 0;
    const revealIfFramed = () => {
      if (video.videoWidth < 16 || video.videoHeight < 16) return;
      if (poll) window.clearInterval(poll);
      poll = 0;
      setWebrtcReady(true);
      setShowScreen(true);
    };
    video.addEventListener('loadeddata', revealIfFramed);
    video.addEventListener('resize', revealIfFramed);
    poll = window.setInterval(revealIfFramed, 250);
    revealIfFramed();
    return () => {
      video.removeEventListener('loadeddata', revealIfFramed);
      video.removeEventListener('resize', revealIfFramed);
      if (poll) window.clearInterval(poll);
    };
  }, [showScreen, status, streamEpoch]);

  if (session.isLoading) return <LoadingBlock label="Opening session…" />;
  if (!session.data) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-muted-foreground">Session not found.</p>
        <Button className="mt-4" onClick={() => navigate('/sessions')}>
          Back to sessions
        </Button>
      </div>
    );
  }

  const connected = status === 'streaming';
  const deviceName = device.data?.name ?? session.data.deviceId;

  const onMinimize = () => {
    if (!sessionId || !deviceId) return;
    minimizingRef.current = true;
    minimize({
      sessionId,
      deviceId,
      deviceName,
    });
    navigate('/devices');
  };

  const onEndSession = () => {
    clearMinimized();
    void endSession(orgId!, session.data!.id).finally(() => navigate('/sessions'));
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[hsl(215_32%_6%)] text-slate-100">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Monitor className="h-5 w-5 text-teal-300" />
          <div className="min-w-0">
            <p className="truncate font-display font-semibold">{deviceName}</p>
            <p className="truncate font-mono text-[11px] text-slate-400">{session.data.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs">
            {connected ? (
              <Wifi className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-amber-400" />
            )}
            {STATUS_LABEL[status]}
            {detail ? ` · ${detail}` : ''}
          </span>
          <span className="hidden text-xs text-slate-400 sm:inline">
            {formatDuration(session.data.startedAt ?? session.data.createdAt, session.data.endedAt)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            className="gap-1.5 border border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
            onClick={onMinimize}
            aria-label="Minimize session"
            title="Minimize — keep session live"
          >
            <Minus className="h-4 w-4" />
            <span className="hidden sm:inline">Minimize</span>
          </Button>
          <Button variant="destructive" size="sm" onClick={onEndSession}>
            End session
          </Button>
        </div>
      </header>

      <div
        ref={screenRef}
        tabIndex={0}
        className="relative flex flex-1 items-center justify-center bg-[radial-gradient(ellipse_at_center,_#0f766e22,_transparent_55%),_linear-gradient(160deg,_#0b1220,_#102a2e)] p-4 outline-none"
        onKeyDown={(e) => sendKey('key-down', e)}
        onKeyUp={(e) => sendKey('key-up', e)}
        onPaste={(e) => {
          if (status !== 'streaming') return;
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          if (text) clientRef.current?.pasteToRemote(text);
        }}
      >
        {showScreen ? null : (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[hsl(215_32%_6%)] text-center">
            <div className="h-16 w-16 animate-pulse-soft rounded-2xl border border-teal-400/30 bg-teal-400/10" />
            <p className="font-display text-xl font-semibold">
              {status === 'offline'
                ? 'Device is offline'
                : status === 'reconnecting'
                  ? 'Reconnecting…'
                  : 'Connecting to remote screen…'}
            </p>
            <p className="text-sm text-slate-400">
              {status === 'offline'
                ? (detail ??
                  'The agent is not connected. Make sure the support app is running on the remote PC.')
                : detail?.startsWith('capture:')
                  ? detail.replace(/^capture:\s*/, 'Screen capture failed: ')
                  : status === 'streaming'
                    ? 'Receiving the remote desktop…'
                    : (detail ?? 'Waiting for the first frame from the remote PC.')}
            </p>
          </div>
        )}
        <div
          className="relative h-[calc(100vh-5.5rem)] w-[min(100%,1600px)] max-h-full max-w-full touch-none"
          style={{ touchAction: 'none' }}
          onPointerMove={(e) => sendPointer(e, 'mouse-move')}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            screenRef.current?.focus();
            sendPointer(e, 'mouse-down');
          }}
          onPointerUp={(e) => {
            sendPointer(e, 'mouse-up');
            try {
              e.currentTarget.releasePointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
          }}
          onPointerCancel={(e) => {
            sendPointer(e, 'mouse-up');
          }}
          onPointerLeave={() => setLocalPointer(null)}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={(e) => {
            e.preventDefault();
            const el = e.currentTarget as HTMLElement;
            const video = videoRef.current;
            const content =
              webrtcReady && video && video.videoWidth >= 16
                ? { width: video.videoWidth, height: video.videoHeight }
                : (frameRef.current?.getContentSize() ?? null);
            const mapped = mapPointerToRemote(e.clientX, e.clientY, el, content);
            if (!mapped) return;
            clientRef.current?.sendInput({
              kind: 'wheel',
              deltaY: e.deltaY,
              x: mapped.x,
              y: mapped.y,
            });
          }}
        >
          <RemoteScreenFrame
            ref={frameRef}
            className={`pointer-events-none h-full w-full cursor-none select-none rounded-nd-xl border border-white/10 bg-black object-contain shadow-2xl ${webrtcReady ? 'invisible' : ''}`}
          />
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`pointer-events-none absolute inset-0 h-full w-full cursor-none select-none rounded-nd-xl border border-white/10 bg-black object-contain shadow-2xl ${webrtcReady ? '' : 'invisible'}`}
          />
          {localPointer ? (
            <div
              className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-teal-300 bg-teal-400/30 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
              style={{ left: `${localPointer.x * 100}%`, top: `${localPointer.y * 100}%` }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
