/**
 * @fileoverview Handles incoming WebSocket messages with rate limiting, JSON parsing,
 * message dispatch, async error handling, and fallback to the general message handler.
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

		try {
			const parsed = JSON.parse(rawStr);
			const jsonResult = handlers.onJson(connection, parsed);
			if (
				jsonResult &&
				typeof (jsonResult as Promise<void>).catch === "function"
			) {
				(jsonResult as Promise<void>).catch((err) => {
					const error = err instanceof Error ? err : new Error(String(err));
					console.error(
						`[Subatom WS] onJson async handler rejected for connection ${connection.id}:`,
						error.message,
					);
					try {
						handlers.onError?.(connection, error);
					} catch (errHandlerErr) {
						console.error(
							`[Subatom WS] onError handler threw for connection ${connection.id}:`,
							(errHandlerErr as Error).message,
						);
					}
				});
			}
		} catch {
			// Not JSON payload; continue to normal onMessage handler
		}
	}

	if (!handlers.onMessage) return;

	try {
		const result = handlers.onMessage(connection, data, isBinary);
		if (result && typeof (result as Promise<void>).catch === "function") {
			(result as Promise<void>).catch((err) => {
				const error = err instanceof Error ? err : new Error(String(err));
				console.error(
					`[Subatom WS] onMessage async handler rejected for connection ${connection.id}:`,
					error.message,
				);
				try {
					handlers.onError?.(connection, error);
				} catch (errHandlerErr) {
					console.error(
						`[Subatom WS] onError handler threw for connection ${connection.id}:`,
						(errHandlerErr as Error).message,
					);
				}
			});
		}
	} catch (err) {
		const error = err instanceof Error ? err : new Error(String(err));
		console.error(
			`[Subatom WS] onMessage handler threw for connection ${connection.id}:`,
			error.message,
		);
		try {
			handlers.onError?.(connection, error);
		} catch (errHandlerErr) {
			console.error(
				`[Subatom WS] onError handler threw for connection ${connection.id}:`,
				(errHandlerErr as Error).message,
			);
		}
	}
}
