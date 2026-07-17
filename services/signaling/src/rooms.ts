import type { WebSocket } from 'ws';

export interface RoomPeer {
  peerId: string;
  organizationId: string;
  socket: WebSocket;
  isAlive: boolean;
  joinedAt: number;
  lastSeenAt: number;
}

export class RoomCapacityError extends Error {
  override readonly name = 'RoomCapacityError';
}

/**
 * In-memory room registry keyed by `sessionId`. Each room holds the set of
 * peers (typically an operator's browser/desktop client and a device agent,
 * plus optional view-only observers) currently signaling for that session.
 *
 * This is intentionally process-local: horizontal scaling of the signaling
 * service requires sticky routing by sessionId (e.g. consistent-hash LB or a
 * shared pub/sub backplane), which is out of scope for this in-memory
 * implementation but is the natural extension point.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Map<string, RoomPeer>>();

  constructor(private readonly maxPeersPerRoom: number) {}

  join(sessionId: string, peer: RoomPeer): void {
    let room = this.rooms.get(sessionId);
    if (!room) {
      room = new Map();
      this.rooms.set(sessionId, room);
    }

    if (!room.has(peer.peerId) && room.size >= this.maxPeersPerRoom) {
      throw new RoomCapacityError(
        `Room ${sessionId} is full (max ${this.maxPeersPerRoom} peers)`,
      );
    }

    room.set(peer.peerId, peer);
  }

  leave(sessionId: string, peerId: string): void {
    const room = this.rooms.get(sessionId);
    if (!room) return;
    room.delete(peerId);
    if (room.size === 0) {
      this.rooms.delete(sessionId);
    }
  }

  /** Remove a peer from every room it belongs to (used on socket close). */
  leaveAll(peerId: string): void {
    for (const [sessionId, room] of this.rooms) {
      if (room.delete(peerId) && room.size === 0) {
        this.rooms.delete(sessionId);
      }
    }
  }

  getPeer(sessionId: string, peerId: string): RoomPeer | undefined {
    return this.rooms.get(sessionId)?.get(peerId);
  }

  getRoom(sessionId: string): ReadonlyMap<string, RoomPeer> | undefined {
    return this.rooms.get(sessionId);
  }

  listPeerIds(sessionId: string): string[] {
    return Array.from(this.rooms.get(sessionId)?.keys() ?? []);
  }

  roomCount(): number {
    return this.rooms.size;
  }

  peerCount(): number {
    let total = 0;
    for (const room of this.rooms.values()) total += room.size;
    return total;
  }

  /** Iterate all peers across all rooms, e.g. for heartbeat sweeps. */
  *allPeers(): IterableIterator<{ sessionId: string; peer: RoomPeer }> {
    for (const [sessionId, room] of this.rooms) {
      for (const peer of room.values()) {
        yield { sessionId, peer };
      }
    }
  }
}
