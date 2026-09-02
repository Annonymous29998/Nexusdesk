import { RemoteStreamClient, type StreamStatus } from '@/lib/remote-stream';
import type { InputEvent } from '@/lib/screen-stream';

export interface AgentUpdateInfo {
  agentVersion: string;
  minAgentVersion: string;
}

interface LiveRemoteSession {
  sessionId: string;
  deviceId: string;
  orgId: string;
  client: RemoteStreamClient;
  refCount: number;
  keepAlive: boolean;
  closed: boolean;
  status: StreamStatus;
  detail?: string;
  webrtcReady: boolean;
  mediaStream: MediaStream | null;
  videoEls: Set<HTMLVideoElement>;
  jpegLatest: string | null;
  jpegRaf: number | null;
  jpegHandlers: Set<(jpeg: string) => void>;
  statusHandlers: Set<(status: StreamStatus, detail?: string) => void>;
  webrtcHandlers: Set<(ready: boolean) => void>;
  agentUpdateHandlers: Set<(info: AgentUpdateInfo) => void>;
}

const registry = new Map<string, LiveRemoteSession>();

function attachStream(live: LiveRemoteSession, stream: MediaStream): void {
  live.mediaStream = stream;
  for (const el of live.videoEls) {
    if (el.srcObject !== stream) el.srcObject = stream;
    void el.play().catch(() => undefined);
  }
}

function flushJpeg(live: LiveRemoteSession): void {
  live.jpegRaf = null;
  const jpeg = live.jpegLatest;
  if (!jpeg) return;
  for (const handler of live.jpegHandlers) handler(jpeg);
}

function createLive(opts: {
  orgId: string;
  sessionId: string;
  deviceId: string;
}): LiveRemoteSession {
  const live: LiveRemoteSession = {
    sessionId: opts.sessionId,
    deviceId: opts.deviceId,
    orgId: opts.orgId,
    client: null as unknown as RemoteStreamClient,
    refCount: 1,
    keepAlive: false,
    closed: false,
    status: 'connecting',
    webrtcReady: false,
    mediaStream: null,
    videoEls: new Set(),
    jpegLatest: null,
    jpegRaf: null,
    jpegHandlers: new Set(),
    statusHandlers: new Set(),
    webrtcHandlers: new Set(),
    agentUpdateHandlers: new Set(),
  };

  live.client = new RemoteStreamClient({
    orgId: opts.orgId,
    sessionId: opts.sessionId,
    deviceId: opts.deviceId,
    onStatus: (status, detail) => {
      live.status = status;
      live.detail = detail;
      for (const handler of live.statusHandlers) handler(status, detail);
    },
    onFrame: (jpeg) => {
      if (live.webrtcReady) return;
      live.jpegLatest = jpeg;
      if (live.jpegRaf == null) {
        live.jpegRaf = requestAnimationFrame(() => flushJpeg(live));
      }
    },
    onVideoStream: (stream) => {
      attachStream(live, stream);
    },
    onScreenMeta: (data) => {
      if (data.agentUpdateRequired === true) {
        const info = {
          agentVersion: String(data.agentVersion ?? ''),
          minAgentVersion: String(data.minAgentVersion ?? ''),
        };
        for (const handler of live.agentUpdateHandlers) handler(info);
      }
    },
  });
  live.client.connect();
  return live;
}

export function acquireRemoteSession(opts: {
  orgId: string;
  sessionId: string;
  deviceId: string;
}): LiveRemoteSession {
  const existing = registry.get(opts.sessionId);
  if (existing && !existing.closed && existing.deviceId === opts.deviceId) {
    existing.refCount += 1;
    existing.keepAlive = false;
    return existing;
  }
  if (existing) {
    existing.keepAlive = false;
    existing.closed = true;
    existing.client.close({ stopStream: true });
    registry.delete(opts.sessionId);
  }
  const live = createLive(opts);
  registry.set(opts.sessionId, live);
  return live;
}

export function setRemoteSessionKeepAlive(sessionId: string, keepAlive: boolean): void {
  const live = registry.get(sessionId);
  if (live) live.keepAlive = keepAlive;
}

export function releaseRemoteSession(sessionId: string, options?: { stopStream?: boolean }): void {
  const live = registry.get(sessionId);
  if (!live) return;
  live.refCount = Math.max(0, live.refCount - 1);
  if (live.refCount > 0) return;
  if (live.keepAlive && options?.stopStream !== true) return;
  closeRemoteSession(sessionId);
}

export function closeRemoteSession(sessionId: string): void {
  const live = registry.get(sessionId);
  if (!live) return;
  live.keepAlive = false;
  live.closed = true;
  live.refCount = 0;
  if (live.jpegRaf != null) cancelAnimationFrame(live.jpegRaf);
  live.client.close({ stopStream: true });
  registry.delete(sessionId);
}

export function attachRemoteVideo(sessionId: string, el: HTMLVideoElement): void {
  const live = registry.get(sessionId);
  if (!live) return;
  live.videoEls.add(el);
  if (live.mediaStream && el.srcObject !== live.mediaStream) {
    el.srcObject = live.mediaStream;
    void el.play().catch(() => undefined);
  }
}

export function detachRemoteVideo(sessionId: string, el: HTMLVideoElement): void {
  registry.get(sessionId)?.videoEls.delete(el);
}

export function sendRemoteInput(sessionId: string, input: InputEvent): void {
  registry.get(sessionId)?.client.sendInput(input);
}

export function pasteToRemoteSession(sessionId: string, text: string): void {
  registry.get(sessionId)?.client.pasteToRemote(text);
}

export function requestRemoteClipboard(sessionId: string): void {
  registry.get(sessionId)?.client.requestRemoteClipboard();
}

export function subscribeRemoteSession(
  sessionId: string,
  handlers: {
    onStatus?: (status: StreamStatus, detail?: string) => void;
    onJpeg?: (jpeg: string) => void;
    onWebrtcReady?: (ready: boolean) => void;
    onAgentUpdateRequired?: (info: AgentUpdateInfo) => void;
  },
): () => void {
  const live = registry.get(sessionId);
  if (!live) return () => undefined;
  if (handlers.onStatus) {
    live.statusHandlers.add(handlers.onStatus);
    handlers.onStatus(live.status, live.detail);
  }
  if (handlers.onJpeg) live.jpegHandlers.add(handlers.onJpeg);
  if (handlers.onWebrtcReady) live.webrtcHandlers.add(handlers.onWebrtcReady);
  if (handlers.onAgentUpdateRequired) live.agentUpdateHandlers.add(handlers.onAgentUpdateRequired);
  return () => {
    if (handlers.onStatus) live.statusHandlers.delete(handlers.onStatus);
    if (handlers.onJpeg) live.jpegHandlers.delete(handlers.onJpeg);
    if (handlers.onWebrtcReady) live.webrtcHandlers.delete(handlers.onWebrtcReady);
    if (handlers.onAgentUpdateRequired)
      live.agentUpdateHandlers.delete(handlers.onAgentUpdateRequired);
  };
}

export function markWebrtcReady(sessionId: string, ready: boolean): void {
  const live = registry.get(sessionId);
  if (!live || live.webrtcReady === ready) return;
  live.webrtcReady = ready;
  for (const handler of live.webrtcHandlers) handler(ready);
}
