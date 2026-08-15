import type {
	IWebSocketHandlers,
	WebSocketMessageData,
} from "../../../types/websocket/IWebSocket.js";
import type { WebSocketConnection } from "../WebSocketConnection.js";

export function dispatchMessage(
	connection: WebSocketConnection,
	handlers: IWebSocketHandlers,
	data: WebSocketMessageData,
	isBinary: boolean,
): void {
	if (!connection._rateLimiter.tryConsume()) {
		connection.close(1008, "Rate limit exceeded");
		return;
	}

	if (!handlers.onMessage) return;

	try {
		const result = handlers.onMessage(connection, data, isBinary);
		if (result instanceof Promise) {
			result.catch((err) =>
				console.error(
					`[Subatom WS] onMessage handler rejected for ${connection.id}:`,
					err?.message ?? err,
				),
			);
		}
	} catch (err) {
		console.error(
			`[Subatom WS] onMessage handler threw for ${connection.id}:`,
			(err as Error).message,
		);
	}
}
