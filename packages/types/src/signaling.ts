import type { RemoteConnectionMode, SignalingMessageType } from './enums.js';

/** Base envelope for all WebRTC signaling messages. */
export interface SignalingEnvelope<T extends SignalingMessageType = SignalingMessageType> {
  type: T;
  sessionId: string;
  connectionId: string;
  fromPeerId: string;
  toPeerId: string;
  timestamp: number;
}

export interface SdpPayload {
  sdp: string;
  sdpType: 'offer' | 'answer';
}

export interface IceCandidatePayload {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment: string | null;
}

export interface SignalingOffer extends SignalingEnvelope<SignalingMessageType.Offer> {
  payload: SdpPayload & {
    mode: RemoteConnectionMode;
  };
}

export interface SignalingAnswer extends SignalingEnvelope<SignalingMessageType.Answer> {
  payload: SdpPayload;
}

export interface SignalingIceCandidate
  extends SignalingEnvelope<SignalingMessageType.IceCandidate> {
  payload: IceCandidatePayload;
}

export interface SignalingRenegotiate extends SignalingEnvelope<SignalingMessageType.Renegotiate> {
  payload: SdpPayload & {
    reason: string;
  };
}

export interface SignalingHangup extends SignalingEnvelope<SignalingMessageType.Hangup> {
  payload: {
    reason: string;
  };
}

export interface SignalingError extends SignalingEnvelope<SignalingMessageType.Error> {
  payload: {
    code: string;
    message: string;
  };
}

export type SignalingMessage =
  | SignalingOffer
  | SignalingAnswer
  | SignalingIceCandidate
  | SignalingRenegotiate
  | SignalingHangup
  | SignalingError;

export interface TurnCredentials {
  urls: string[];
  username: string;
  credential: string;
  ttlSeconds: number;
  expiresAt: string;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}
