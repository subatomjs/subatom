/**
 * @fileoverview Bulletproof incoming WebSocket message router with automatic
 * JSON decoding, fast-path binary handling, and safe fallback.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type {
	ISocketHandlers,
	SocketMessageData,
} from "../types/socket.types.js";
import type { SocketConnection } from "../SocketConnection.js";

export function dispatchMessage(
	connection: SocketConnection,
	handlers: ISocketHandlers,
	data: SocketMessageData,
	isBinary: boolean,
): void {
	if (!connection._rateLimiter.tryConsume()) {
		connection.close(1008, "Rate limit exceeded");
		return;
	}

	let jsonDispatched = false;

	if (handlers.onJson && !isBinary) {
		let rawStr: string;
		if (typeof data === "string") {
			rawStr = data;
		} else if (Buffer.isBuffer(data)) {
			rawStr = data.toString("utf-8");
		} else if (Array.isArray(data)) {
			rawStr = Buffer.concat(data).toString("utf-8");
		} else {
			rawStr = Buffer.from(data).toString("utf-8");
		}

		// Fast test for JSON object / array
		const trimmed = rawStr.trim();
		if (
			(trimmed.startsWith("{") && trimmed.endsWith("}")) ||
			(trimmed.startsWith("[") && trimmed.endsWith("]"))
		) {
			try {
				const parsed = JSON.parse(trimmed);
				jsonDispatched = true;
				const jsonResult = handlers.onJson(connection, parsed);
				if (
					jsonResult &&
					typeof (jsonResult as Promise<void>).catch === "function"
				) {
					(jsonResult as Promise<void>).catch((err) => {
						const error = err instanceof Error ? err : new Error(String(err));
						console.error(
							`[Subatom WS] onJson async handler rejected for ${connection.id}:`,
							error.message,
						);
						handlers.onError?.(connection, error);
					});
				}
			} catch {
				jsonDispatched = false;
			}
		}
	}

	// If already handled by onJson, do not fire onMessage duplicate
	if (jsonDispatched) return;
	if (!handlers.onMessage) return;

	try {
		const result = handlers.onMessage(connection, data, isBinary);
		if (result && typeof (result as Promise<void>).catch === "function") {
			(result as Promise<void>).catch((err) => {
				const error = err instanceof Error ? err : new Error(String(err));
				console.error(
					`[Subatom WS] onMessage async handler rejected for ${connection.id}:`,
					error.message,
				);
				handlers.onError?.(connection, error);
			});
		}
	} catch (err) {
		const error = err instanceof Error ? err : new Error(String(err));
		console.error(
			`[Subatom WS] onMessage handler threw for ${connection.id}:`,
			error.message,
		);
		handlers.onError?.(connection, error);
	}
}
