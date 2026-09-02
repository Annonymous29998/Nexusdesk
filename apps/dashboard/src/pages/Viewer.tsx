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
import type { StreamStatus } from '@/lib/remote-stream';
import {
  acquireRemoteSession,
  attachRemoteVideo,
  closeRemoteSession,
  detachRemoteVideo,
  markWebrtcReady,
  pasteToRemoteSession,
  releaseRemoteSession,
  requestRemoteClipboard,
  sendRemoteInput,
  setRemoteSessionKeepAlive,
  subscribeRemoteSession,
  type AgentUpdateInfo,
} from '@/lib/remote-session-runtime';
import { formatDuration } from '@/lib/utils';
import { useActiveViewerStore } from '@/stores/active-viewer';

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

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

function statusCopy(
  status: StreamStatus,
  webrtcReady: boolean,
  detail?: string,
): { label: string; title: string; subtitle: string } {
  if (status === 'offline') {
    return {
      label: 'offline',
      title: 'Guest disconnected',
      subtitle: detail ?? 'The agent is not connected. Reinstall the support app on the remote PC.',
    };
  }
  if (status === 'reconnecting') {
    return {
      label: 'reconnecting',
      title: 'Reconnecting…',
      subtitle: detail ?? 'Trying another network path…',
    };
  }
  if (status === 'disconnected' || status === 'error') {
    return {
      label: status,
      title: 'Disconnected',
      subtitle: detail ?? 'The remote session closed.',
    };
  }
  if (status === 'streaming' && webrtcReady) {
    return { label: 'connected', title: 'Connected', subtitle: 'Live remote desktop' };
  }
  if (status === 'streaming') {
    return {
      label: 'live',
      title: 'Negotiating video…',
      subtitle: detail ?? 'Secure channel is up. Waiting for the first video frame.',
    };
  }
  if (status === 'waiting') {
    return {
      label: 'connecting',
      title: 'Connecting to guest…',
      subtitle: detail ?? 'Negotiating video…',
    };
  }
  if (status === 'authenticating') {
    return {
      label: 'connecting',
      title: 'Establishing secure connection…',
      subtitle: detail ?? 'Authenticating with the API.',
    };
  }
  return {
    label: 'connecting',
    title: 'Connecting…',
    subtitle: detail ?? 'Opening the remote session.',
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
  const [agentUpdate, setAgentUpdate] = useState<AgentUpdateInfo | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<RemoteScreenFrameHandle>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const showScreenRef = useRef(false);
  const webrtcReadyRef = useRef(false);
  const pendingMoveRef = useRef<{
    x: number;
    y: number;
    button: 'left' | 'right' | 'middle';
    buttons: number;
  } | null>(null);
  const moveRafRef = useRef<number | null>(null);
  const minimizingRef = useRef(false);
  const clipboardPullTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  showScreenRef.current = showScreen;
  webrtcReadyRef.current = webrtcReady;

  const session = useQuery({
    queryKey: ['session', orgId, sessionId],
    enabled: Boolean(orgId && sessionId),
    queryFn: () => getSession(orgId!, sessionId!),
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  const deviceId = session.data?.deviceId;
  const device = useQuery({
    queryKey: ['device', orgId, deviceId],
    enabled: Boolean(orgId && deviceId),
    queryFn: () => getDevice(orgId!, deviceId!),
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!sessionId) return;
    minimizingRef.current = false;
    const current = useActiveViewerStore.getState().minimized;
    if (current?.sessionId === sessionId) clearMinimized();
  }, [sessionId, clearMinimized]);

  useEffect(() => {
    if (!sessionId || !deviceId || !orgId) return;
    acquireRemoteSession({ orgId, sessionId, deviceId });
    const unsubscribe = subscribeRemoteSession(sessionId, {
      onStatus: (s, d) => {
        setStatus(s);
        setDetail(d);
      },
      onJpeg: (jpeg) => {
        frameRef.current?.setFrame(jpeg);
        if (!showScreenRef.current) setShowScreen(true);
      },
      onWebrtcReady: (ready) => {
        setWebrtcReady(ready);
        if (ready) setShowScreen(true);
      },
      onAgentUpdateRequired: (info) => setAgentUpdate(info),
    });
    return () => {
      unsubscribe();
      if (clipboardPullTimerRef.current) {
        clearTimeout(clipboardPullTimerRef.current);
        clipboardPullTimerRef.current = null;
      }
      if (minimizingRef.current) {
        setRemoteSessionKeepAlive(sessionId, true);
        releaseRemoteSession(sessionId, { stopStream: false });
      } else {
        releaseRemoteSession(sessionId);
      }
    };
  }, [sessionId, deviceId, orgId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !sessionId) return;
    attachRemoteVideo(sessionId, video);
    let poll = 0;
    const revealIfFramed = () => {
      if (video.videoWidth < 16 || video.videoHeight < 16) return;
      if (poll) window.clearInterval(poll);
      poll = 0;
      markWebrtcReady(sessionId, true);
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
      detachRemoteVideo(sessionId, video);
    };
  }, [sessionId, deviceId]);

  const pasteLocalClipboard = async () => {
    if (!sessionId || status !== 'streaming') return;
    try {
      const text =
        navigator.clipboard && window.isSecureContext ? await navigator.clipboard.readText() : '';
      if (text) pasteToRemoteSession(sessionId, text);
    } catch {
      /* ignore */
    }
  };

  const isModDown = (e: React.KeyboardEvent) => e.ctrlKey || e.metaKey;

  const sendKey = (kind: 'key-down' | 'key-up', e: React.KeyboardEvent) => {
    if (!sessionId || status !== 'streaming') return;
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
        sendRemoteInput(sessionId, { kind: 'key-down', key: 'Control' });
        sendRemoteInput(sessionId, { kind: 'key-down', key: e.key, code: e.code });
      } else {
        sendRemoteInput(sessionId, { kind: 'key-up', key: e.key, code: e.code });
        sendRemoteInput(sessionId, { kind: 'key-up', key: 'Control' });
        if (clipboardPullTimerRef.current) clearTimeout(clipboardPullTimerRef.current);
        clipboardPullTimerRef.current = setTimeout(() => {
          if (sessionId) requestRemoteClipboard(sessionId);
        }, 250);
      }
      return;
    }

    e.preventDefault();
    if (e.key === 'Meta') {
      sendRemoteInput(sessionId, { kind, key: 'Control' });
      return;
    }
    if (e.metaKey && !e.ctrlKey && kind === 'key-down') {
      sendRemoteInput(sessionId, { kind: 'key-down', key: 'Control' });
    }
    sendRemoteInput(sessionId, { kind, key: e.key, code: e.code || undefined });
    if (e.metaKey && !e.ctrlKey && kind === 'key-up' && e.key !== 'Control') {
      sendRemoteInput(sessionId, { kind: 'key-up', key: 'Control' });
    }
  };

  const pointerButton = (e: React.PointerEvent): 'left' | 'right' | 'middle' => {
    if (e.buttons & 2 || e.button === 2) return 'right';
    if (e.buttons & 4 || e.button === 1) return 'middle';
    return 'left';
  };

  const moveCursorOverlay = (e: React.PointerEvent) => {
    const overlay = cursorRef.current;
    const box = e.currentTarget as HTMLElement;
    if (!overlay || !box) return;
    const rect = box.getBoundingClientRect();
    overlay.style.opacity = '1';
    overlay.style.transform = `translate(${e.clientX - rect.left}px, ${e.clientY - rect.top}px)`;
  };

  const flushPointerMoveSync = () => {
    if (moveRafRef.current !== null) {
      cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = null;
    }
    const pending = pendingMoveRef.current;
    pendingMoveRef.current = null;
    if (pending && sessionId) {
      sendRemoteInput(sessionId, { kind: 'mouse-move', ...pending });
    }
  };

  const sendPointer = (e: React.PointerEvent, kind: 'mouse-move' | 'mouse-down' | 'mouse-up') => {
    if (!sessionId || !showScreenRef.current) return;
    const el = e.currentTarget as HTMLElement;
    const video = videoRef.current;
    const content =
      webrtcReadyRef.current && video && video.videoWidth >= 16
        ? { width: video.videoWidth, height: video.videoHeight }
        : (frameRef.current?.getContentSize() ?? null);
    const mapped = mapPointerToRemote(e.clientX, e.clientY, el, content);
    if (!mapped) return;
    const button = pointerButton(e);
    const buttons = e.buttons;
    if (kind === 'mouse-move') {
      pendingMoveRef.current = { x: mapped.x, y: mapped.y, button, buttons };
      if (moveRafRef.current === null) {
        moveRafRef.current = requestAnimationFrame(() => {
          moveRafRef.current = null;
          const pending = pendingMoveRef.current;
          pendingMoveRef.current = null;
          if (pending && sessionId) sendRemoteInput(sessionId, { kind: 'mouse-move', ...pending });
        });
      }
      return;
    }
    flushPointerMoveSync();
    sendRemoteInput(sessionId, { kind, x: mapped.x, y: mapped.y, button, buttons });
  };

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
  const copy = statusCopy(status, webrtcReady, detail);

  const onMinimize = () => {
    if (!sessionId || !deviceId) return;
    minimizingRef.current = true;
    setRemoteSessionKeepAlive(sessionId, true);
    minimize({ sessionId, deviceId, deviceName });
    navigate('/devices');
  };

  const onEndSession = () => {
    if (sessionId) closeRemoteSession(sessionId);
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
            {connected && webrtcReady ? (
              <Wifi className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <WifiOff className="h-3.5 w-3.5 text-amber-400" />
            )}
            {copy.label}
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

      {agentUpdate ? (
        <div className="border-b border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
          Guest agent {agentUpdate.agentVersion || 'unknown'} is out of date. Reinstall from the
          join link (requires {agentUpdate.minAgentVersion}+) for reliable remote control.
        </div>
      ) : null}

      <div
        ref={screenRef}
        tabIndex={0}
        className="relative flex flex-1 cursor-none items-center justify-center bg-[radial-gradient(ellipse_at_center,_#0f766e22,_transparent_55%),_linear-gradient(160deg,_#0b1220,_#102a2e)] p-4 outline-none"
        onKeyDown={(e) => sendKey('key-down', e)}
        onKeyUp={(e) => sendKey('key-up', e)}
        onPaste={(e) => {
          if (status !== 'streaming' || !sessionId) return;
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          if (text) pasteToRemoteSession(sessionId, text);
        }}
      >
        {showScreen ? null : (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[hsl(215_32%_6%)] text-center">
            <div className="h-16 w-16 animate-pulse-soft rounded-2xl border border-teal-400/30 bg-teal-400/10" />
            <p className="font-display text-xl font-semibold">{copy.title}</p>
            <p className="text-sm text-slate-400">{copy.subtitle}</p>
          </div>
        )}
        <div
          className="relative h-[calc(100vh-5.5rem)] w-[min(100%,1600px)] max-h-full max-w-full cursor-none touch-none"
          style={{ touchAction: 'none' }}
          onPointerMove={(e) => {
            moveCursorOverlay(e);
            sendPointer(e, 'mouse-move');
          }}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            screenRef.current?.focus();
            moveCursorOverlay(e);
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
          onPointerLeave={() => {
            if (cursorRef.current) cursorRef.current.style.opacity = '0';
          }}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={(e) => {
            e.preventDefault();
            if (!sessionId) return;
            const el = e.currentTarget as HTMLElement;
            const video = videoRef.current;
            const content =
              webrtcReadyRef.current && video && video.videoWidth >= 16
                ? { width: video.videoWidth, height: video.videoHeight }
                : (frameRef.current?.getContentSize() ?? null);
            const mapped = mapPointerToRemote(e.clientX, e.clientY, el, content);
            if (!mapped) return;
            sendRemoteInput(sessionId, {
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
            className={`pointer-events-none absolute inset-0 h-full w-full select-none rounded-nd-xl border border-white/10 bg-black object-contain shadow-2xl ${webrtcReady ? '' : 'invisible'}`}
          />
          <div
            ref={cursorRef}
            className="pointer-events-none absolute left-0 top-0 z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-teal-400/80 opacity-0 shadow-[0_0_12px_rgba(45,212,191,0.9)]"
          />
        </div>
      </div>
    </div>
  );
}
