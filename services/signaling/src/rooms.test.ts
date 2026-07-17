import { describe, expect, it } from 'vitest';
import { RoomCapacityError, RoomManager } from './rooms.js';
import type { WebSocket } from 'ws';

function fakeSocket(): WebSocket {
  return { readyState: 1 } as unknown as WebSocket;
}

function peer(peerId: string, organizationId = 'org-1') {
  return {
    peerId,
    organizationId,
    socket: fakeSocket(),
    isAlive: true,
    joinedAt: Date.now(),
    lastSeenAt: Date.now(),
  };
}

describe('RoomManager', () => {
  it('joins and lists peers for a session room', () => {
    const rooms = new RoomManager(8);
    rooms.join('session-a', peer('agent-1'));
    rooms.join('session-a', peer('operator-1'));

    expect(rooms.listPeerIds('session-a').sort()).toEqual(['agent-1', 'operator-1']);
    expect(rooms.roomCount()).toBe(1);
  });

  it('enforces room capacity', () => {
    const rooms = new RoomManager(1);
    rooms.join('session-b', peer('agent-1'));
    expect(() => rooms.join('session-b', peer('operator-1'))).toThrow(RoomCapacityError);
  });

  it('cleans up empty rooms on leave', () => {
    const rooms = new RoomManager(4);
    rooms.join('session-c', peer('agent-1'));
    rooms.leave('session-c', 'agent-1');
    expect(rooms.roomCount()).toBe(0);
  });
});
