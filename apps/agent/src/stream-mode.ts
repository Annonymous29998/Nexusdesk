import {
  INPUT_DATA_CHANNEL_LABEL,
  MOVE_DATA_CHANNEL_LABEL,
  isDiscreteInput,
  selectInputTransport,
} from '@nexusdesk/shared';

/** JPEG is a bounded fallback, not a second live encoder beside a healthy WebRTC path. */
export const JPEG_FALLBACK_DELAY_MS = 4_000;
export const MAX_ICE_RESTARTS = 4;
export const WEBRTC_MIN_FRAMES_FOR_HEALTHY = 1;

export { INPUT_DATA_CHANNEL_LABEL, MOVE_DATA_CHANNEL_LABEL, isDiscreteInput, selectInputTransport };

export function iceRestartDelayMs(attempt: number): number {
  const n = Math.max(1, attempt);
  return Math.min(8_000, 400 * 2 ** (n - 1));
}

export function isWebrtcHealthy(args: {
  connectionState?: string | null;
  framesPushed: number;
}): boolean {
  const state = args.connectionState ?? '';
  const iceOk = state === 'connected' || state === 'completed';
  return iceOk && args.framesPushed >= WEBRTC_MIN_FRAMES_FOR_HEALTHY;
}

export function shouldStartJpegFallback(args: {
  webrtcStarted: boolean;
  webrtcHealthy: boolean;
  elapsedMs: number;
  delayMs?: number;
}): boolean {
  if (args.webrtcHealthy) return false;
  if (!args.webrtcStarted) return true;
  return args.elapsedMs >= (args.delayMs ?? JPEG_FALLBACK_DELAY_MS);
}

export function shouldStopJpeg(webrtcHealthy: boolean): boolean {
  return webrtcHealthy;
}
