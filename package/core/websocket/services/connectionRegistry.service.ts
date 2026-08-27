import type { IWebSocketConnection } from "../../../types/websocket/IWebSocket.js";

/**
 * High-performance state storage for active connections and rooms.
 * Stores connection references by unique ID to prevent stale instance leaks
 * and guarantee broadcast delivery across concurrent socket clients.
 */
export class ConnectionRegistry {
	private readonly connections = new Map<string, IWebSocketConnection>();
	private readonly rooms = new Map<string, Map<string, IWebSocketConnection>>();

	public add(connection: IWebSocketConnection): void {
		this.connections.set(connection.id, connection);
	}

	public remove(connection: IWebSocketConnection): void {
		this.connections.delete(connection.id);
		for (const room of connection.rooms) {
			const members = this.rooms.get(room);
			if (members) {
				members.delete(connection.id);
				if (members.size === 0) {
					this.rooms.delete(room);
				}
			}
		}
	}

	public get(id: string): IWebSocketConnection | undefined {
		return this.connections.get(id);
	}

	public has(id: string): boolean {
		return this.connections.has(id);
	}

	public joinRoom(room: string, connection: IWebSocketConnection): void {
		if (!room || typeof room !== "string") return;
		let members = this.rooms.get(room);
		if (!members) {
			members = new Map<string, IWebSocketConnection>();
			this.rooms.set(room, members);
		}
		members.set(connection.id, connection);
	}

	public leaveRoom(room: string, connection: IWebSocketConnection): void {
		if (!room || typeof room !== "string") return;
		const members = this.rooms.get(room);
		if (!members) return;
		members.delete(connection.id);
		if (members.size === 0) {
			this.rooms.delete(room);
		}
	}

	public getRoom(room: string): ReadonlyMap<string, IWebSocketConnection> {
		return this.rooms.get(room) ?? new Map<string, IWebSocketConnection>();
	}

	public getRoomNames(): string[] {
		return Array.from(this.rooms.keys());
	}

	public size(): number {
		return this.connections.size;
	}

	public all(): IterableIterator<IWebSocketConnection> {
		return this.connections.values();
	}

	public clear(): void {
		this.connections.clear();
		this.rooms.clear();
	}
}