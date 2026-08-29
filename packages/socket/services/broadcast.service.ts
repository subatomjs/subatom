/**
 * @fileoverview Broadcasts data to all active WebSocket connections or a specific room,
 * with optional exclusion of a connection by ID.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { SocketSendPayload } from "../types/socket.types.js";
import type { ConnectionRegistry } from "./connectionRegistry.service.js";

export function broadcastAll(
	registry: ConnectionRegistry,
	data: SocketSendPayload,
	excludeId?: string,
): void {
	for (const connection of registry.all()) {
		if (excludeId && connection.id === excludeId) continue;
		if (connection.readyState === 1 /* WebSocket.OPEN */) {
			connection.send(data);
		}
	}
}

export function broadcastToRoom(
	registry: ConnectionRegistry,
	room: string,
	data: SocketSendPayload,
	excludeId?: string,
): void {
	const members = registry.getRoom(room);
	for (const connection of members.values()) {
		if (excludeId && connection.id === excludeId) continue;
		if (connection.readyState === 1 /* WebSocket.OPEN */) {
			connection.send(data);
		}
	}
}
