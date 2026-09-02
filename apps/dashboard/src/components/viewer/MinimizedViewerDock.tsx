import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@nexusdesk/ui';
import { Maximize2, Monitor, Wifi, WifiOff, X } from 'lucide-react';
import { endSession } from '@/api/sessions';
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
  releaseRemoteSession,
  subscribeRemoteSession,
} from '@/lib/remote-session-runtime';
import { useActiveViewerStore } from '@/stores/active-viewer';

/**
 * Floating mini viewer shown after Minimize — reuses the existing remote
 * session connection instead of opening a second WebRTC peer.
 */
export function MinimizedViewerDock() {
  const navigate = useNavigate();
  const orgId = useOrgId();
  const minimized = useActiveViewerStore((s) => s.minimized);
  const clearMinimized = useActiveViewerStore((s) => s.clearMinimized);
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [showScreen, setShowScreen] = useState(false);
  const [webrtcReady, setWebrtcReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<RemoteScreenFrameHandle>(null);

  useEffect(() => {
    if (!minimized || !orgId) {
      setShowScreen(false);
      setWebrtcReady(false);
      setStatus('idle');
      return;
    }

    acquireRemoteSession({
      orgId,
      sessionId: minimized.sessionId,
      deviceId: minimized.deviceId,
    });
    const unsubscribe = subscribeRemoteSession(minimized.sessionId, {
      onStatus: (s) => setStatus(s),
      onJpeg: (jpeg) => {
        frameRef.current?.setFrame(jpeg);
        setShowScreen((open) => open || true);
      },
      onWebrtcReady: (ready) => {
        setWebrtcReady(ready);
        if (ready) setShowScreen(true);
      },
    });
    return () => {
      unsubscribe();
      releaseRemoteSession(minimized.sessionId, { stopStream: false });
    };
  }, [minimized?.sessionId, minimized?.deviceId, orgId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !minimized) return;
    attachRemoteVideo(minimized.sessionId, video);
    let poll = 0;
    const revealIfFramed = () => {
      if (video.videoWidth < 16 || video.videoHeight < 16) return;
      if (poll) window.clearInterval(poll);
      poll = 0;
      markWebrtcReady(minimized.sessionId, true);
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
      detachRemoteVideo(minimized.sessionId, video);
    };
  }, [minimized?.sessionId]);

  if (!minimized) return null;

  const live = status === 'streaming';

  const restore = () => {
    const { sessionId } = minimized;
    clearMinimized();
    navigate(`/viewer/${sessionId}`);
  };

  const end = () => {
    const { sessionId } = minimized;
    closeRemoteSession(sessionId);
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
            <WifiOff className="h-3 w-3 text-slate-400" />
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
        <div className="relative aspect-video w-full bg-black">
          <RemoteScreenFrame
            ref={frameRef}
            className={`h-full w-full object-contain ${webrtcReady ? 'invisible' : ''}`}
          />
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`absolute inset-0 h-full w-full object-contain ${webrtcReady ? '' : 'invisible'}`}
          />
        </div>
        {showScreen ? null : (
          <div className="absolute inset-0 flex aspect-video items-center justify-center text-xs text-slate-400">
            Connecting to remote screen…
          </div>
        )}
      </button>
    </div>
  );
}
