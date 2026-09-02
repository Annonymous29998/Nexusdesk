import { captureScreenFrame } from '../capture/screen.js';
import type { RawFrame } from '../capture/encoder.js';
import { createLogger } from '../logger.js';
import type { IceServerConfig } from './peer.js';
import { rgbaToI420 } from './i420.js';
import type { RemoteInputEvent } from '../capture/input.js';
import {
  INPUT_DATA_CHANNEL_LABEL,
  MAX_ICE_RESTARTS,
  MOVE_DATA_CHANNEL_LABEL,
  iceRestartDelayMs,
  isWebrtcHealthy,
} from '../stream-mode.js';

const log = createLogger('webrtc-stream');

export { INPUT_DATA_CHANNEL_LABEL, MOVE_DATA_CHANNEL_LABEL };

const MAX_VIDEO_BITRATE = 1_200_000;

export interface WebRtcStreamerOptions {
  fps: number;
  maxWidth: number;
  iceServers: IceServerConfig[];
  sendSignal: (event: string, data: Record<string, unknown>) => void;
  joinSession: (sessionId: string) => void | Promise<void>;
  onInput: (payload: RemoteInputEvent) => void;
  /** Fired once a session is actually pushing desktop frames (not just a connected peer). */
  onVideoReady?: (sessionId: string) => void;
  onFailed?: (sessionId: string, reason: string) => void;
}

interface DataChannelLike {
  readyState: string;
  send: (data: string) => void;
  close: () => void;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null;
  onopen: (() => void) | null;
}

interface RtpSenderLike {
  getParameters?: () => {
    encodings?: Array<{ maxBitrate?: number; maxFramerate?: number }>;
    degradationPreference?: string;
  };
  setParameters?: (params: {
    encodings?: Array<{ maxBitrate?: number; maxFramerate?: number }>;
    degradationPreference?: string;
  }) => Promise<void>;
}

interface SessionPeer {
  sessionId: string;
  iceServers: IceServerConfig[];
  pc: {
    createDataChannel: (
      label: string,
      opts?: { ordered?: boolean; maxRetransmits?: number },
    ) => DataChannelLike;
    setRemoteDescription: (desc: { type: string; sdp?: string }) => Promise<void>;
    createOffer: (opts?: {
      offerToReceiveAudio?: boolean;
      iceRestart?: boolean;
    }) => Promise<{ type: string; sdp?: string }>;
    setLocalDescription: (desc: { type: string; sdp?: string }) => Promise<void>;
    addIceCandidate: (candidate: Record<string, unknown>) => Promise<void>;
    close: () => void;
    connectionState?: string;
    iceConnectionState?: string;
    getSenders?: () => RtpSenderLike[];
    restartIce?: () => void;
  };
  track: { stop: () => void };
  videoSource: { onFrame: (frame: { width: number; height: number; data: Buffer }) => void };
  inputChannel?: DataChannelLike;
  moveChannel?: DataChannelLike;
  iceRestarts: number;
  restartTimer: ReturnType<typeof setTimeout> | null;
  framesPushed: number;
}

/**
 * WebRTC screen transport: H.264/VP8/VP9 video track + DataChannel for input.
 * Signaling (SDP/ICE) is relayed over the API WebSocket.
 */
export class WebRtcStreamer {
  private readonly sessions = new Map<string, SessionPeer>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private skippedWhileBusy = 0;
  private wrtcLoaded = false;
  private wrtcModule: WrtcModule | null = null;
  private readonly targetIntervalMs: number;
  private lastLoopMs = 0;
  private readonly videoReadyNotified = new Set<string>();

  constructor(private readonly opts: WebRtcStreamerOptions) {
    this.targetIntervalMs = Math.max(33, Math.floor(1000 / Math.max(1, Math.min(24, opts.fps))));
  }

  get active(): boolean {
    return this.sessions.size > 0;
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  isHealthy(sessionId: string): boolean {
    const peer = this.sessions.get(sessionId);
    if (!peer) return false;
    return isWebrtcHealthy({
      connectionState: peer.pc.connectionState ?? peer.pc.iceConnectionState,
      framesPushed: peer.framesPushed,
    });
  }

  async start(sessionId: string, iceServers?: IceServerConfig[]): Promise<boolean> {
    if (this.sessions.has(sessionId)) return true;
    const wrtc = await this.loadWrtc();
    if (!wrtc) return false;

    const servers = iceServers?.length
      ? iceServers
      : this.opts.iceServers.length
        ? this.opts.iceServers
        : [{ urls: 'stun:stun.l.google.com:19302' }];

    try {
      await Promise.resolve(this.opts.joinSession(sessionId));
      await new Promise((r) => setTimeout(r, 80));

      const { RTCPeerConnection, nonstandard } = wrtc;
      const pc = new RTCPeerConnection({
        iceServers: servers,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
      });
      const videoSource = new nonstandard.RTCVideoSource();
      const track = videoSource.createTrack();
      pc.addTrack(track);
      void this.applySendParameters(pc);

      const inputChannel = pc.createDataChannel(INPUT_DATA_CHANNEL_LABEL, { ordered: true });
      this.wireInputChannel(inputChannel);
      let moveChannel: DataChannelLike;
      try {
        moveChannel = pc.createDataChannel(MOVE_DATA_CHANNEL_LABEL, {
          ordered: false,
          maxRetransmits: 0,
        });
      } catch {
        moveChannel = pc.createDataChannel(MOVE_DATA_CHANNEL_LABEL, { ordered: true });
      }
      this.wireInputChannel(moveChannel);

      inputChannel.onopen = () => log.info({ sessionId }, 'input datachannel open');
      moveChannel.onopen = () => log.info({ sessionId }, 'move datachannel open');

      pc.onicecandidate = (event: {
        candidate: { toJSON: () => Record<string, unknown> } | null;
      }) => {
        if (!event.candidate) return;
        const json = event.candidate.toJSON();
        this.opts.sendSignal('signal:ice_candidate', {
          sessionId,
          candidate: json.candidate,
          sdpMid: json.sdpMid ?? null,
          sdpMLineIndex: json.sdpMLineIndex ?? null,
        });
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        log.info({ sessionId, state }, 'webrtc connection state');
        if (state === 'connected' || state === 'completed') {
          this.maybeNotifyReady(sessionId);
        }
        if (state === 'disconnected') {
          this.scheduleIceRestart(sessionId);
        }
        if (state === 'failed') {
          void this.restartIce(sessionId);
        }
        if (state === 'closed') {
          this.opts.onFailed?.(sessionId, 'peer closed');
        }
      };

      const offer = await pc.createOffer({ offerToReceiveAudio: false });
      await pc.setLocalDescription(offer);
      this.opts.sendSignal('signal:offer', {
        sessionId,
        sdp: offer.sdp,
        sdpType: 'offer',
      });

      this.sessions.set(sessionId, {
        sessionId,
        iceServers: servers,
        pc,
        track,
        videoSource,
        inputChannel,
        moveChannel,
        iceRestarts: 0,
        restartTimer: null,
        framesPushed: 0,
      });

      if (this.sessions.size === 1) this.scheduleLoop();
      log.info({ sessionId }, 'WebRTC stream started (video + input datachannel)');
      return true;
    } catch (err) {
      log.warn({ err, sessionId }, 'WebRTC start failed');
      this.opts.onFailed?.(sessionId, 'start failed');
      return false;
    }
  }

  async handleAnswer(sessionId: string, sdp: string): Promise<void> {
    const peer = this.sessions.get(sessionId);
    if (!peer) return;
    try {
      await peer.pc.setRemoteDescription({ type: 'answer', sdp });
    } catch (err) {
      log.warn({ err, sessionId }, 'setRemoteDescription failed');
    }
  }

  async handleIceCandidate(
    sessionId: string,
    candidate: string,
    sdpMid: string | null,
    sdpMLineIndex: number | null,
  ): Promise<void> {
    const peer = this.sessions.get(sessionId);
    if (!peer || !candidate) return;
    try {
      await peer.pc.addIceCandidate({
        candidate,
        sdpMid,
        sdpMLineIndex,
      });
    } catch (err) {
      log.warn({ err, sessionId }, 'addIceCandidate failed');
    }
  }

  async handleRenegotiate(sessionId: string): Promise<void> {
    await this.restartIce(sessionId);
  }

  stop(sessionId?: string): void {
    if (sessionId) {
      const peer = this.sessions.get(sessionId);
      if (peer) this.teardownPeer(peer);
    } else {
      for (const peer of this.sessions.values()) this.teardownPeer(peer);
    }
    if (this.sessions.size === 0) {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    }
  }

  /**
   * Deadline-based pacing: the wait is what is left of the frame budget after
   * capture + encode, so a slow frame does not halve the frame rate.
   * If a tick is still running, the next deadline is skipped (drop stale).
   */
  private scheduleLoop(): void {
    if (this.sessions.size === 0) return;
    const startedAt = Date.now();
    this.timer = setTimeout(
      () => {
        if (this.busy) {
          this.skippedWhileBusy += 1;
          this.scheduleLoop();
          return;
        }
        void this.tick().finally(() => {
          this.lastLoopMs = Date.now() - startedAt;
          this.scheduleLoop();
        });
      },
      Math.max(1, this.targetIntervalMs - Math.min(this.lastLoopMs, this.targetIntervalMs - 1)),
    );
  }

  private async tick(): Promise<void> {
    if (this.busy || this.sessions.size === 0) return;
    this.busy = true;
    try {
      const raw = await captureScreenFrame(this.opts.maxWidth, 60);
      const i420 = await this.frameToI420(raw);
      if (!i420) return;
      const frame = { width: i420.width, height: i420.height, data: i420.data };
      for (const peer of this.sessions.values()) {
        peer.videoSource.onFrame(frame);
        peer.framesPushed += 1;
        this.maybeNotifyReady(peer.sessionId);
      }
    } catch (err) {
      log.debug({ err }, 'webrtc frame tick failed');
    } finally {
      this.busy = false;
    }
  }

  private maybeNotifyReady(sessionId: string): void {
    if (this.videoReadyNotified.has(sessionId)) return;
    if (!this.isHealthy(sessionId)) return;
    this.videoReadyNotified.add(sessionId);
    this.opts.onVideoReady?.(sessionId);
  }

  private scheduleIceRestart(sessionId: string): void {
    const peer = this.sessions.get(sessionId);
    if (!peer || peer.restartTimer) return;
    const delay = iceRestartDelayMs(peer.iceRestarts + 1);
    peer.restartTimer = setTimeout(() => {
      peer.restartTimer = null;
      void this.restartIce(sessionId);
    }, delay);
  }

  private async restartIce(sessionId: string): Promise<void> {
    const peer = this.sessions.get(sessionId);
    if (!peer) return;
    if (peer.iceRestarts >= MAX_ICE_RESTARTS) {
      log.warn({ sessionId }, 'ICE restart budget exhausted');
      this.opts.onFailed?.(sessionId, 'ice failed');
      return;
    }
    peer.iceRestarts += 1;
    try {
      if (typeof peer.pc.restartIce === 'function') peer.pc.restartIce();
      const offer = await peer.pc.createOffer({ iceRestart: true, offerToReceiveAudio: false });
      await peer.pc.setLocalDescription(offer);
      this.opts.sendSignal('signal:offer', {
        sessionId,
        sdp: offer.sdp,
        sdpType: 'offer',
        iceRestart: true,
      });
      log.info({ sessionId, attempt: peer.iceRestarts }, 'ICE restart offer sent');
    } catch (err) {
      log.warn({ err, sessionId }, 'ICE restart failed');
      this.opts.onFailed?.(sessionId, 'ice restart failed');
    }
  }

  private async applySendParameters(pc: SessionPeer['pc']): Promise<void> {
    try {
      const sender = pc.getSenders?.().find((s) => s);
      if (!sender?.getParameters || !sender.setParameters) return;
      const params = sender.getParameters();
      params.degradationPreference = 'maintain-framerate';
      if (!params.encodings?.length) params.encodings = [{}];
      params.encodings[0] = {
        ...params.encodings[0],
        maxBitrate: MAX_VIDEO_BITRATE,
        maxFramerate: Math.min(24, this.opts.fps),
      };
      await sender.setParameters(params);
    } catch {
      /* encoding constraints are best-effort on wrtc */
    }
  }

  private wireInputChannel(channel: DataChannelLike): void {
    channel.onmessage = (event) => {
      try {
        const raw = typeof event.data === 'string' ? event.data : String(event.data);
        const payload = JSON.parse(raw) as RemoteInputEvent;
        if (payload?.kind) this.opts.onInput(payload);
      } catch (err) {
        log.debug({ err }, 'datachannel input parse failed');
      }
    };
  }

  private teardownPeer(peer: SessionPeer): void {
    if (peer.restartTimer) clearTimeout(peer.restartTimer);
    peer.inputChannel?.close();
    peer.moveChannel?.close();
    peer.track.stop();
    peer.pc.close();
    this.sessions.delete(peer.sessionId);
    this.videoReadyNotified.delete(peer.sessionId);
  }

  private async frameToI420(
    raw: RawFrame,
  ): Promise<{ width: number; height: number; data: Buffer } | null> {
    let rgba: Buffer;
    let srcWidth = raw.width;
    let srcHeight = raw.height;

    if (raw.format === 'jpeg' || raw.format === 'png') {
      try {
        const sharp = (await import('sharp')).default;
        const decoded = await sharp(raw.data)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        rgba = Buffer.isBuffer(decoded.data) ? decoded.data : Buffer.from(decoded.data);
        srcWidth = decoded.info.width;
        srcHeight = decoded.info.height;
      } catch (err) {
        log.debug({ err }, 'decode capture for WebRTC failed');
        return null;
      }
    } else if (raw.format === 'rgba' && raw.data.length > 4) {
      rgba = raw.data;
    } else {
      return null;
    }

    const width = srcWidth & ~1;
    const height = srcHeight & ~1;
    if (width < 2 || height < 2) return null;
    return {
      width,
      height,
      data: rgbaToI420(rgba, srcWidth, srcHeight, width, height),
    };
  }

  private async loadWrtc(): Promise<WrtcModule | null> {
    if (this.wrtcLoaded) return this.wrtcModule;
    this.wrtcLoaded = true;
    try {
      const imported = (await import('@roamhq/wrtc')) as { default?: WrtcModule } & WrtcModule;
      const mod = imported.default ?? imported;
      if (!mod.RTCPeerConnection || !mod.nonstandard?.RTCVideoSource) {
        throw new Error('@roamhq/wrtc missing RTCPeerConnection or RTCVideoSource');
      }
      this.wrtcModule = mod;
      return mod;
    } catch (err) {
      log.warn({ err }, 'wrtc not available — WebRTC disabled');
      return null;
    }
  }
}

interface WrtcModule {
  RTCPeerConnection: new (config: {
    iceServers: IceServerConfig[];
    bundlePolicy?: string;
    rtcpMuxPolicy?: string;
  }) => SessionPeer['pc'] & {
    addTrack: (track: unknown) => void;
    onicecandidate:
      ((event: { candidate: { toJSON: () => Record<string, unknown> } | null }) => void) | null;
    onconnectionstatechange: (() => void) | null;
    connectionState?: string;
  };
  nonstandard: {
    RTCVideoSource: new () => {
      createTrack: () => { stop: () => void };
      onFrame: (frame: { width: number; height: number; data: Buffer }) => void;
    };
  };
}
