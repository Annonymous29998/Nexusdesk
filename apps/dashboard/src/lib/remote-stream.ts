import {
  INPUT_DATA_CHANNEL_LABEL,
  MOVE_DATA_CHANNEL_LABEL,
  WS_EVENTS,
  selectInputTransport,
} from '@nexusdesk/shared';
import { getTurnCredentials } from '@/api/sessions';
import {
  ScreenStreamClient,
  type InputEvent,
  type ScreenStreamOptions,
  type StreamStatus,
} from '@/lib/screen-stream';

const WEBRTC_CONNECT_TIMEOUT_MS = 20_000;
const MAX_ICE_RESTARTS = 4;

export type { InputEvent, StreamStatus };

export interface RemoteStreamOptions extends ScreenStreamOptions {
  orgId: string;
  onVideoStream?: (stream: MediaStream) => void;
}

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

function minimizeReceiveLatency(pc: RTCPeerConnection): void {
  for (const receiver of pc.getReceivers()) {
    if (receiver.track?.kind !== 'video') continue;
    const tunable = receiver as RTCRtpReceiver & {
      playoutDelayHint?: number;
      jitterBufferTarget?: number;
    };
    try {
      tunable.playoutDelayHint = 0;
    } catch {
      /* not supported */
    }
    try {
      tunable.jitterBufferTarget = 0;
    } catch {
      /* not supported */
    }
  }
}

function applyReceiverBitrate(pc: RTCPeerConnection): void {
  for (const receiver of pc.getReceivers()) {
    if (receiver.track?.kind !== 'video') continue;
    try {
      const params = receiver.getParameters?.();
      if (!params) continue;
      (receiver as RTCRtpReceiver & { jitterBufferTarget?: number }).jitterBufferTarget = 0;
    } catch {
      /* ignore */
    }
  }
  void pc;
}

/**
 * Remote viewer: WebRTC video + DataChannel primary, JPEG over WebSocket as fallback.
 */
export class RemoteStreamClient {
  private readonly signaling: ScreenStreamClient;
  private pc: RTCPeerConnection | null = null;
  private inputChannel: RTCDataChannel | null = null;
  private moveChannel: RTCDataChannel | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private connected = false;
  private iceRestarts = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: RemoteStreamOptions) {
    this.signaling = new ScreenStreamClient({
      sessionId: options.sessionId,
      deviceId: options.deviceId,
      onStatus: (status, detail) => {
        if (this.connected && status === 'streaming') return;
        if (status === 'waiting' && this.connected) return;
        options.onStatus?.(status, detail);
      },
      onFrame: options.onFrame,
      onClipboard: options.onClipboard,
      onScreenMeta: options.onScreenMeta,
      onSignal: (event, data) => void this.handleSignal(event, data),
    });
  }

  connect(): void {
    this.closed = false;
    this.connected = false;
    void this.prepareIce().finally(() => this.signaling.connect());
  }

  sendInput(input: InputEvent): void {
    const payload = JSON.stringify({ sessionId: this.options.sessionId, ...input });
    const transport = selectInputTransport(
      input.kind,
      this.moveChannel?.readyState === 'open',
      this.inputChannel?.readyState === 'open',
    );
    if (transport === 'move' && this.moveChannel) {
      try {
        this.moveChannel.send(payload);
        return;
      } catch {
        /* fall through */
      }
    }
    if (
      (transport === 'input' || transport === 'move') &&
      this.inputChannel?.readyState === 'open'
    ) {
      try {
        this.inputChannel.send(payload);
        return;
      } catch {
        /* fall through */
      }
    }
    this.signaling.sendInput(input);
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
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.inputChannel?.close();
    this.moveChannel?.close();
    this.inputChannel = null;
    this.moveChannel = null;
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
    this.connected = false;
    this.options.onStatus?.('waiting', `${message} Continuing with the remote desktop stream.`);
  }

  private wireChannel(channel: RTCDataChannel): void {
    if (channel.label === MOVE_DATA_CHANNEL_LABEL) this.moveChannel = channel;
    if (channel.label === INPUT_DATA_CHANNEL_LABEL) this.inputChannel = channel;
    channel.onopen = () => {
      if (this.connected) this.options.onStatus?.('streaming', 'live');
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
    minimizeReceiveLatency(pc);
    applyReceiverBitrate(pc);
    const tracks = pc
      .getReceivers()
      .map((receiver) => receiver.track)
      .filter((track): track is MediaStreamTrack => Boolean(track) && track.kind === 'video');
    if (!tracks.length) return;
    this.deliverVideo(new MediaStream(tracks));
  }

  private deliverVideo(stream: MediaStream): void {
    this.markConnected('live');
    this.options.onVideoStream?.(stream);
  }

  private scheduleIceRestart(): void {
    if (this.closed || this.iceRestarts >= MAX_ICE_RESTARTS || this.restartTimer) return;
    const delay = Math.min(8_000, 400 * 2 ** this.iceRestarts);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.requestIceRestart();
    }, delay);
  }

  private requestIceRestart(): void {
    if (this.closed || this.iceRestarts >= MAX_ICE_RESTARTS) return;
    this.iceRestarts += 1;
    this.options.onStatus?.('reconnecting', 'Trying another network path…');
    this.signaling.sendSignal(WS_EVENTS.signalRenegotiate, {
      sessionId: this.options.sessionId,
    });
  }

  private async acceptOffer(sdp: string): Promise<void> {
    if (this.closed) return;

    if (this.pc) {
      try {
        await this.pc.setRemoteDescription({ type: 'offer', sdp });
        preferVideoCodecs(this.pc);
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.signaling.sendSignal(WS_EVENTS.signalAnswer, {
          sessionId: this.options.sessionId,
          sdp: answer.sdp,
          sdpType: 'answer',
        });
      } catch {
        this.failWebRtc('WebRTC renegotiation failed');
      }
      return;
    }

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
      minimizeReceiveLatency(pc);
      const stream = ev.streams[0] ?? (ev.track ? new MediaStream([ev.track]) : null);
      if (stream) this.deliverVideo(stream);
    };

    pc.ondatachannel = (ev) => {
      if (
        ev.channel.label === INPUT_DATA_CHANNEL_LABEL ||
        ev.channel.label === MOVE_DATA_CHANNEL_LABEL
      ) {
        this.wireChannel(ev.channel);
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
        this.iceRestarts = 0;
        this.deliverVideoFromPeer(pc);
      }
      if (pc.connectionState === 'failed') {
        this.scheduleIceRestart();
      }
      if (pc.connectionState === 'disconnected' && !this.closed) {
        this.options.onStatus?.('reconnecting', 'WebRTC disconnected — retrying…');
        this.scheduleIceRestart();
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
