import type { IWebSocketConnection } from "../../../types/websocket/IWebSocket.js";

/**
 * Central bookkeeping for every live connection and every room. Kept as its
 * own service so heartbeat/broadcast/shutdown can all operate over the same
 * source of truth without reaching into WebSocketManager internals.
 */
export class ConnectionRegistry {
	private readonly connections = new Set<IWebSocketConnection>();
	private readonly rooms = new Map<string, Set<IWebSocketConnection>>();

	public add(connection: IWebSocketConnection): void {
		this.connections.add(connection);
	}

	public remove(connection: IWebSocketConnection): void {
		this.connections.delete(connection);
		for (const [room, members] of this.rooms) {
			members.delete(connection);
			if (members.size === 0) this.rooms.delete(room);
		}
	}

	public joinRoom(room: string, connection: IWebSocketConnection): void {
		let members = this.rooms.get(room);
		if (!members) {
			members = new Set();
			this.rooms.set(room, members);
		}
		members.add(connection);
	}

	public leaveRoom(room: string, connection: IWebSocketConnection): void {
		const members = this.rooms.get(room);
		if (!members) return;
		members.delete(connection);
		if (members.size === 0) this.rooms.delete(room);
	}

	public getRoom(room: string): ReadonlySet<IWebSocketConnection> {
		return this.rooms.get(room) ?? new Set();
	}

	public size(): number {
		return this.connections.size;
	}

	public all(): IterableIterator<IWebSocketConnection> {
		return this.connections.values();
	}
}
