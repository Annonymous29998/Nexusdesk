import { WS_EVENTS } from '@nexusdesk/shared';
import { getTurnCredentials } from '@/api/sessions';
import {
  ScreenStreamClient,
  type InputEvent,
  type ScreenStreamOptions,
  type StreamStatus,
} from '@/lib/screen-stream';

/** Must match agent `INPUT_DATA_CHANNEL_LABEL`. */
const INPUT_DATA_CHANNEL_LABEL = 'nexusdesk-input';

const WEBRTC_CONNECT_TIMEOUT_MS = 20_000;

export type { InputEvent, StreamStatus };

export interface RemoteStreamOptions extends Omit<ScreenStreamOptions, 'onFrame'> {
  orgId: string;
  onVideoStream?: (stream: MediaStream) => void;
}

/** Prefer H.264, then VP9, then VP8 in the WebRTC answer. */
function preferVideoCodecs(pc: RTCPeerConnection): void {
  if (typeof RTCRtpReceiver === 'undefined' || !RTCRtpReceiver.getCapabilities) return;
  const caps = RTCRtpReceiver.getCapabilities('video');
  if (!caps?.codecs?.length) return;

  const rank = (mime: string): number => {
    const upper = mime.toUpperCase();
    if (upper.includes('H264')) return 0;
    if (upper.includes('VP9')) return 1;
    if (upper.includes('VP8')) return 2;
    return 9;
  };

  const sorted = [...caps.codecs].sort((a, b) => rank(a.mimeType) - rank(b.mimeType));
  for (const transceiver of pc.getTransceivers()) {
    const kind = transceiver.receiver.track?.kind ?? transceiver.sender.track?.kind;
    if (kind !== 'video') continue;
    try {
      transceiver.setCodecPreferences(sorted);
    } catch {
      /* ignore */
    }
  }
}

/**
 * WebRTC-only remote viewer — video via RTCPeerConnection (H.264/VP8/VP9),
 * input via DataChannel. WebSocket is used for auth, signaling, and clipboard only.
 */
export class RemoteStreamClient {
  private readonly signaling: ScreenStreamClient;
  private pc: RTCPeerConnection | null = null;
  private inputChannel: RTCDataChannel | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private connected = false;

  constructor(private readonly options: RemoteStreamOptions) {
    this.signaling = new ScreenStreamClient({
      sessionId: options.sessionId,
      deviceId: options.deviceId,
      onStatus: (status, detail) => {
        if (this.connected && status === 'streaming') return;
        if (status === 'waiting' && this.connected) return;
        options.onStatus?.(status, detail);
      },
      onClipboard: options.onClipboard,
      onSignal: (event, data) => void this.handleSignal(event, data),
    });
  }

  connect(): void {
    this.closed = false;
    this.connected = false;
    void this.prepareIce().finally(() => this.signaling.connect());
  }

  sendInput(input: InputEvent): void {
    if (this.inputChannel?.readyState === 'open') {
      this.inputChannel.send(JSON.stringify({ sessionId: this.options.sessionId, ...input }));
      return;
    }
    // DataChannel not open yet — WS fallback only until WebRTC connects.
    if (!this.connected) {
      this.signaling.sendInput(input);
    }
  }

  requestRemoteClipboard(): void {
    this.sendInput({ kind: 'clipboard-pull' });
  }

  pasteToRemote(text: string): void {
    this.sendInput({ kind: 'clipboard-paste', text });
  }

  close(options?: { stopStream?: boolean }): void {
    this.closed = true;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.inputChannel?.close();
    this.inputChannel = null;
    this.pc?.close();
    this.pc = null;
    this.signaling.close(options);
  }

  private async prepareIce(): Promise<void> {
    try {
      await getTurnCredentials(this.options.orgId, this.options.sessionId);
    } catch {
      /* STUN-only is acceptable on many networks */
    }
  }

  private markConnected(detail: string): void {
    this.connected = true;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.options.onStatus?.('streaming', detail);
  }

  private failWebRtc(message: string): void {
    if (this.closed) return;
    this.pc?.close();
    this.pc = null;
    this.inputChannel = null;
    this.options.onStatus?.('error', message);
  }

  private wireInputChannel(channel: RTCDataChannel): void {
    this.inputChannel = channel;
    channel.onopen = () => {
      if (this.connected) {
        this.options.onStatus?.('streaming', 'live (WebRTC + DataChannel)');
      }
    };
  }

  private async handleSignal(event: string, data: Record<string, unknown>): Promise<void> {
    if (this.closed || typeof RTCPeerConnection === 'undefined') return;
    const sessionId = String(data.sessionId ?? '');
    if (sessionId && sessionId !== this.options.sessionId) return;

    if (event === WS_EVENTS.signalOffer && typeof data.sdp === 'string') {
      await this.acceptOffer(data.sdp);
      return;
    }

    if (event === WS_EVENTS.signalIce && this.pc && typeof data.candidate === 'string') {
      try {
        await this.pc.addIceCandidate({
          candidate: data.candidate,
          sdpMid: typeof data.sdpMid === 'string' ? data.sdpMid : null,
          sdpMLineIndex: typeof data.sdpMLineIndex === 'number' ? data.sdpMLineIndex : null,
        });
      } catch {
        /* ignore late ICE */
      }
    }
  }

  private deliverVideoFromPeer(pc: RTCPeerConnection): void {
    const tracks = pc
      .getReceivers()
      .map((receiver) => receiver.track)
      .filter((track): track is MediaStreamTrack => Boolean(track) && track.kind === 'video');
    if (!tracks.length) {
      this.markConnected('live (WebRTC)');
      return;
    }
    this.deliverVideo(new MediaStream(tracks));
  }

  private deliverVideo(stream: MediaStream): void {
    this.markConnected('live (WebRTC)');
    this.options.onVideoStream?.(stream);
  }

  private async acceptOffer(sdp: string): Promise<void> {
    if (this.pc || this.closed) return;

    let iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
    try {
      const creds = await getTurnCredentials(this.options.orgId, this.options.sessionId);
      if (creds.iceServers?.length) iceServers = creds.iceServers;
    } catch {
      /* STUN-only fallback */
    }

    const pc = new RTCPeerConnection({
      iceServers,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });
    this.pc = pc;

    this.connectTimer = setTimeout(() => {
      if (!this.connected && !this.closed) {
        this.failWebRtc(
          'WebRTC connection timed out — check TURN/STUN settings or reinstall the guest agent.',
        );
      }
    }, WEBRTC_CONNECT_TIMEOUT_MS);

    pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? (ev.track ? new MediaStream([ev.track]) : null);
      if (stream) this.deliverVideo(stream);
    };

    pc.ondatachannel = (ev) => {
      if (ev.channel.label === INPUT_DATA_CHANNEL_LABEL) {
        this.wireInputChannel(ev.channel);
      }
    };

    pc.onicecandidate = (ev) => {
      if (!ev.candidate) return;
      this.signaling.sendSignal(WS_EVENTS.signalIce, {
        sessionId: this.options.sessionId,
        candidate: ev.candidate.candidate,
        sdpMid: ev.candidate.sdpMid,
        sdpMLineIndex: ev.candidate.sdpMLineIndex,
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this.deliverVideoFromPeer(pc);
      }
      if (pc.connectionState === 'failed') {
        this.failWebRtc('WebRTC peer connection failed — verify network and TURN credentials.');
      }
      if (pc.connectionState === 'disconnected' && !this.closed) {
        this.options.onStatus?.('reconnecting', 'WebRTC disconnected — retrying…');
      }
    };

    try {
      await pc.setRemoteDescription({ type: 'offer', sdp });
      preferVideoCodecs(pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.signaling.sendSignal(WS_EVENTS.signalAnswer, {
        sessionId: this.options.sessionId,
        sdp: answer.sdp,
        sdpType: 'answer',
      });
    } catch (err) {
      this.failWebRtc(err instanceof Error ? err.message : 'WebRTC negotiation failed');
    }
  }
}
