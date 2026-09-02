/** Minimum guest agent that supports TURN ICE, DataChannel input, and WebRTC-primary video. */
export const MIN_REMOTE_CONTROL_AGENT_VERSION = '0.1.25';

/** Parse dotted versions like 0.1.24 / 0.1.25-hotfix into comparable numeric tuples. */
export function parseAgentVersion(version: string | undefined | null): number[] {
  if (!version) return [];
  return version
    .trim()
    .split(/[.+-]/)
    .map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

export function compareAgentVersion(a: string | undefined | null, b: string): number {
  const left = parseAgentVersion(a);
  const right = parseAgentVersion(b);
  const len = Math.max(left.length, right.length, 3);
  for (let i = 0; i < len; i += 1) {
    const lv = left[i] ?? 0;
    const rv = right[i] ?? 0;
    if (lv > rv) return 1;
    if (lv < rv) return -1;
  }
  return 0;
}

export function isRemoteControlAgentCompatible(version?: string | null): boolean {
  return compareAgentVersion(version, MIN_REMOTE_CONTROL_AGENT_VERSION) >= 0;
}

export const INPUT_DATA_CHANNEL_LABEL = 'nexusdesk-input';
export const MOVE_DATA_CHANNEL_LABEL = 'nexusdesk-move';

export function selectInputTransport(
  kind: string,
  moveChannelOpen: boolean,
  inputChannelOpen: boolean,
): 'move' | 'input' | 'websocket' {
  if (kind === 'mouse-move' && moveChannelOpen) return 'move';
  if (inputChannelOpen) return 'input';
  return 'websocket';
}

export function isDiscreteInput(kind: string): boolean {
  return kind !== 'mouse-move';
}
