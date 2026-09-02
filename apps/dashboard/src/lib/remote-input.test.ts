import { describe, expect, it } from 'vitest';
import { isDiscreteInput, selectInputTransport } from '@nexusdesk/shared';

describe('viewer input transport', () => {
  it('coalesces mouse-move onto the unreliable channel when open', () => {
    expect(selectInputTransport('mouse-move', true, true)).toBe('move');
  });

  it('never sends clicks or keys on the move channel', () => {
    expect(selectInputTransport('mouse-down', true, true)).toBe('input');
    expect(selectInputTransport('mouse-up', true, true)).toBe('input');
    expect(selectInputTransport('key-down', true, true)).toBe('input');
    expect(selectInputTransport('wheel', true, true)).toBe('input');
    expect(isDiscreteInput('mouse-down')).toBe(true);
  });

  it('falls back to websocket when no datachannel is open', () => {
    expect(selectInputTransport('mouse-move', false, false)).toBe('websocket');
    expect(selectInputTransport('key-up', false, false)).toBe('websocket');
  });
});
