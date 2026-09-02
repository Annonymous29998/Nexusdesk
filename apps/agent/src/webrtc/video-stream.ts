import { captureScreenFrame } from '../capture/screen.js';
import { createLogger } from '../logger.js';
import type { IceServerConfig } from './peer.js';
import { rgbaToI420 } from './i420.js';
import type { RemoteInputEvent } from '../capture/input.js';

const log = createLogger('webrtc-stream');

/** WebRTC data-channel label for mouse/keyboard/clipboard (replaces WS input when live). */
export const INPUT_DATA_CHANNEL_LABEL = 'nexusdesk-input';

export interface WebRtcStreamerOptions {
  fps: number;
  maxWidth: number;
  iceServers: IceServerConfig[];
  sendSignal: (event: string, data: Record<string, unknown>) => void;
  joinSession: (sessionId: string) => void | Promise<void>;
  onInput: (payload: RemoteInputEvent) => void;
}

interface DataChannelLike {
  readyState: string;
  send: (data: string) => void;
  close: () => void;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null;
  onopen: (() => void) | null;
}

interface SessionPeer {
  sessionId: string;
  pc: {
    createDataChannel: (
      label: string,
      opts?: { ordered?: boolean },
    ) => DataChannelLike;
    setRemoteDescription: (desc: { type: string; sdp?: string }) => Promise<void>;
    createOffer: (opts?: { offerToReceiveAudio?: boolean }) => Promise<{ type: string; sdp?: string }>;
    setLocalDescription: (desc: { type: string; sdp?: string }) => Promise<void>;
    addIceCandidate: (candidate: Record<string, unknown>) => Promise<void>;
    close: () => void;
  };
  track: { stop: () => void };
  videoSource: { onFrame: (frame: { width: number; height: number; data: Buffer }) => void };
  inputChannel?: DataChannelLike;
}

/**
 * WebRTC screen transport: H.264/VP8/VP9 video track + DataChannel for input.
 * Signaling (SDP/ICE) is relayed over the API WebSocket.
 */
export class WebRtcStreamer {
  private readonly sessions = new Map<string, SessionPeer>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private wrtcLoaded = false;
  private wrtcModule: WrtcModule | null = null;
  private readonly targetIntervalMs: number;

  constructor(private readonly opts: WebRtcStreamerOptions) {
    this.targetIntervalMs = Math.max(16, Math.floor(1000 / Math.max(1, opts.fps)));
  }

  get active(): boolean {
    return this.sessions.size > 0;
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  async start(sessionId: string): Promise<boolean> {
    if (this.sessions.has(sessionId)) return true;
    const wrtc = await this.loadWrtc();
    if (!wrtc) return false;

    try {
      await Promise.resolve(this.opts.joinSession(sessionId));
      // Allow the API to register this agent in the session signaling room.
      await new Promise((r) => setTimeout(r, 80));

      const { RTCPeerConnection, nonstandard } = wrtc;
      const pc = new RTCPeerConnection({
        iceServers: this.opts.iceServers,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
      });
      const videoSource = new nonstandard.RTCVideoSource();
      const track = videoSource.createTrack();
      pc.addTrack(track);

      const inputChannel = pc.createDataChannel(INPUT_DATA_CHANNEL_LABEL, { ordered: true });
      inputChannel.onmessage = (event) => {
        try {
          const raw = typeof event.data === 'string' ? event.data : String(event.data);
          const payload = JSON.parse(raw) as RemoteInputEvent;
          if (payload?.kind) this.opts.onInput(payload);
        } catch (err) {
          log.debug({ err }, 'datachannel input parse failed');
        }
      };
      inputChannel.onopen = () => log.info({ sessionId }, 'input datachannel open');

      pc.onicecandidate = (event: { candidate: { toJSON: () => Record<string, unknown> } | null }) => {
        if (!event.candidate) return;
        const json = event.candidate.toJSON();
        this.opts.sendSignal('signal:ice_candidate', {
          sessionId,
          candidate: json.candidate,
          sdpMid: json.sdpMid ?? null,
          sdpMLineIndex: json.sdpMLineIndex ?? null,
        });
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
        pc,
        track,
        videoSource,
        inputChannel,
      });

      if (this.sessions.size === 1) this.scheduleLoop();
      log.info({ sessionId }, 'WebRTC stream started (video + input datachannel)');
      return true;
    } catch (err) {
      log.warn({ err, sessionId }, 'WebRTC start failed');
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

  stop(sessionId?: string): void {
    if (sessionId) {
      const peer = this.sessions.get(sessionId);
      if (peer) {
        peer.inputChannel?.close();
        peer.track.stop();
        peer.pc.close();
        this.sessions.delete(sessionId);
      }
    } else {
      for (const peer of this.sessions.values()) {
        peer.inputChannel?.close();
        peer.track.stop();
        peer.pc.close();
      }
      this.sessions.clear();
    }
    if (this.sessions.size === 0 && this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleLoop(): void {
    if (this.sessions.size === 0) return;
    this.timer = setTimeout(() => {
      void this.tick().finally(() => this.scheduleLoop());
    }, this.targetIntervalMs);
  }

  private async tick(): Promise<void> {
    if (this.busy || this.sessions.size === 0) return;
    this.busy = true;
    try {
      const raw = await captureScreenFrame(this.opts.maxWidth, 60);
      if (raw.format !== 'rgba' || raw.data.length <= 4) return;

      let width = raw.width & 1 ? raw.width - 1 : raw.width;
      let height = raw.height & 1 ? raw.height - 1 : raw.height;
      if (width < 2 || height < 2) return;

      const i420 = rgbaToI420(raw.data, raw.width, raw.height, width, height);
      const frame = { width, height, data: i420 };
      for (const peer of this.sessions.values()) {
        peer.videoSource.onFrame(frame);
      }
    } catch (err) {
      log.debug({ err }, 'webrtc frame tick failed');
    } finally {
      this.busy = false;
    }
  }

  private async loadWrtc(): Promise<WrtcModule | null> {
    if (this.wrtcLoaded) return this.wrtcModule;
    this.wrtcLoaded = true;
    try {
      const mod = (await import('@roamhq/wrtc')) as WrtcModule;
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
    onicecandidate: ((event: { candidate: { toJSON: () => Record<string, unknown> } | null }) => void) | null;
  };
  nonstandard: {
    RTCVideoSource: new () => {
      createTrack: () => { stop: () => void };
      onFrame: (frame: { width: number; height: number; data: Buffer }) => void;
    };
  };
}
