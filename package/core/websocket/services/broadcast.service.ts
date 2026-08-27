import type { WebSocketSendPayload } from "../../../types/websocket/IWebSocket.js";
import type { ConnectionRegistry } from "./connectionRegistry.service.js";

export function broadcastAll(
	registry: ConnectionRegistry,
	data: WebSocketSendPayload,
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
	data: WebSocketSendPayload,
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