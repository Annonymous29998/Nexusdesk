import { createLogger } from '../logger.js';

const log = createLogger('webrtc');

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface PeerOptions {
  iceServers: IceServerConfig[];
  onIceCandidate: (candidate: Record<string, unknown>) => void;
  onTrack?: (stream: unknown) => void;
}

export interface SessionDescriptionInit {
  type: 'offer' | 'answer' | 'pranswer' | 'rollback';
  sdp?: string;
}

/**
 * Signaling-ready peer connection helper.
 * Uses native `wrtc` when available; otherwise exposes a stub that still
 * participates in offer/answer exchange for integration testing.
 */
export async function createPeerConnection(options: PeerOptions): Promise<{
  setRemoteDescription: (desc: SessionDescriptionInit) => Promise<void>;
  createAnswer: () => Promise<SessionDescriptionInit>;
  createOffer: () => Promise<SessionDescriptionInit>;
  setLocalDescription: (desc: SessionDescriptionInit) => Promise<void>;
  addIceCandidate: (candidate: Record<string, unknown>) => Promise<void>;
  close: () => void;
}> {
  try {
    const wrtcMod = (await import('wrtc').catch(() => null)) as {
      RTCPeerConnection?: new (config: { iceServers: IceServerConfig[] }) => {
        onicecandidate: ((event: { candidate: { toJSON: () => Record<string, unknown> } | null }) => void) | null;
        ontrack: ((event: { streams: unknown[] }) => void) | null;
        setRemoteDescription: (desc: SessionDescriptionInit) => Promise<void>;
        createAnswer: () => Promise<SessionDescriptionInit>;
        createOffer: () => Promise<SessionDescriptionInit>;
        setLocalDescription: (desc: SessionDescriptionInit) => Promise<void>;
        addIceCandidate: (candidate: Record<string, unknown>) => Promise<void>;
        close: () => void;
      };
    } | null;

    const RTCPeerConnectionImpl =
      wrtcMod?.RTCPeerConnection ??
      (globalThis as { RTCPeerConnection?: new (config: { iceServers: IceServerConfig[] }) => unknown })
        .RTCPeerConnection;

    if (!RTCPeerConnectionImpl) {
      throw new Error('RTCPeerConnection unavailable');
    }

    const pc = new (RTCPeerConnectionImpl as new (config: {
      iceServers: IceServerConfig[];
    }) => {
      onicecandidate: ((event: { candidate: { toJSON: () => Record<string, unknown> } | null }) => void) | null;
      ontrack: ((event: { streams: unknown[] }) => void) | null;
      setRemoteDescription: (desc: SessionDescriptionInit) => Promise<void>;
      createAnswer: () => Promise<SessionDescriptionInit>;
      createOffer: () => Promise<SessionDescriptionInit>;
      setLocalDescription: (desc: SessionDescriptionInit) => Promise<void>;
      addIceCandidate: (candidate: Record<string, unknown>) => Promise<void>;
      close: () => void;
    })({ iceServers: options.iceServers });
    pc.onicecandidate = (event) => {
      if (event.candidate) options.onIceCandidate(event.candidate.toJSON());
    };
    pc.ontrack = (event) => {
      if (options.onTrack && event.streams[0]) options.onTrack(event.streams[0]);
    };

    return {
      setRemoteDescription: (desc) => pc.setRemoteDescription(desc),
      createAnswer: async () => pc.createAnswer(),
      createOffer: async () => pc.createOffer(),
      setLocalDescription: (desc) => pc.setLocalDescription(desc),
      addIceCandidate: (candidate) => pc.addIceCandidate(candidate),
      close: () => pc.close(),
    };
  } catch (err) {
    log.warn({ err }, 'wrtc unavailable — using signaling stub peer');
    return {
      setRemoteDescription: async () => undefined,
      createAnswer: async () => ({ type: 'answer', sdp: 'v=0\r\n' }),
      createOffer: async () => ({ type: 'offer', sdp: 'v=0\r\n' }),
      setLocalDescription: async () => undefined,
      addIceCandidate: async () => undefined,
      close: () => undefined,
    };
  }
}
