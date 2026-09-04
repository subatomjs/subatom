/**
 * @fileoverview High-performance state storage for active connections, rooms,
 * and user identity sessions with leak-proof cleanup.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ISocketConnection } from "../types/socket.types.js";

export class ConnectionRegistry {
	private readonly connections = new Map<string, ISocketConnection>();
	private readonly rooms = new Map<string, Map<string, ISocketConnection>>();
	private readonly userSessions = new Map<
		string,
		Map<string, ISocketConnection>
	>();

	public add(connection: ISocketConnection): void {
		this.connections.set(connection.id, connection);
	}

	public remove(connection: ISocketConnection): void {
		this.connections.delete(connection.id);

		// Clean up from all rooms[cite: 9]
		for (const room of connection.rooms) {
			const members = this.rooms.get(room);
			if (members) {
				members.delete(connection.id);
				if (members.size === 0) {
					this.rooms.delete(room);
				}
			}
		}

		// Clean up user sessions
		if (connection.userId) {
			const sessions = this.userSessions.get(connection.userId);
			if (sessions) {
				sessions.delete(connection.id);
				if (sessions.size === 0) {
					this.userSessions.delete(connection.userId);
				}
			}
		}
	}

	public registerUser(userId: string, connection: ISocketConnection): void {
		if (!userId || typeof userId !== "string") return;
		let sessions = this.userSessions.get(userId);
		if (!sessions) {
			sessions = new Map<string, ISocketConnection>();
			this.userSessions.set(userId, sessions);
		}
		sessions.set(connection.id, connection);
	}

	public unregisterUser(userId: string, connection: ISocketConnection): void {
		const sessions = this.userSessions.get(userId);
		if (sessions) {
			sessions.delete(connection.id);
			if (sessions.size === 0) {
				this.userSessions.delete(userId);
			}
		}
	}

	public getSocketsByUser(userId: string): ISocketConnection[] {
		const sessions = this.userSessions.get(userId);
		return sessions ? Array.from(sessions.values()) : [];
	}

	public get(id: string): ISocketConnection | undefined {
		return this.connections.get(id);
	}

	public has(id: string): boolean {
		return this.connections.has(id);
	}

	public joinRoom(room: string, connection: ISocketConnection): void {
		if (!room || typeof room !== "string") return;
		let members = this.rooms.get(room);
		if (!members) {
			members = new Map<string, ISocketConnection>();
			this.rooms.set(room, members);
		}
		members.set(connection.id, connection);
	}

	public leaveRoom(room: string, connection: ISocketConnection): void {
		if (!room || typeof room !== "string") return;
		const members = this.rooms.get(room);
		if (!members) return;
		members.delete(connection.id);
		if (members.size === 0) {
			this.rooms.delete(room);
		}
	}

	public getRoom(room: string): ReadonlyMap<string, ISocketConnection> {
		return this.rooms.get(room) ?? new Map<string, ISocketConnection>();
	}

	public getRoomNames(): string[] {
		return Array.from(this.rooms.keys());
	}

	public size(): number {
		return this.connections.size;
	}

	public all(): IterableIterator<ISocketConnection> {
		return this.connections.values();
	}

	public clear(): void {
		this.connections.clear();
		this.rooms.clear();
		this.userSessions.clear();
	}
}
