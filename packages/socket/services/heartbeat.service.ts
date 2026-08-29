/**
 * @fileoverview Maintains WebSocket heartbeat checks by pinging active connections
 * and removing or terminating unresponsive or invalid connections.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { SocketConnection } from "../SocketConnection.js";
import type { ConnectionRegistry } from "./connectionRegistry.service.js";

export function startHeartbeat(
	registry: ConnectionRegistry,
	intervalMs: number,
): NodeJS.Timeout {
	if (intervalMs <= 0 || !Number.isFinite(intervalMs)) {
		return setInterval(() => {}, 2_147_483_647);
	}

	const timer = setInterval(() => {
		const snapshot = Array.from(
			registry.all(),
		) as unknown as SocketConnection[];

		for (const connection of snapshot) {
			if (connection.raw.readyState !== 1 /* WebSocket.OPEN */) {
				registry.remove(connection);
				connection.terminate();
				continue;
			}

			if (!connection._isAlive) {
				registry.remove(connection);
				connection.terminate();
				continue;
			}

			connection._isAlive = false;
			try {
				connection.raw.ping();
			} catch {
				registry.remove(connection);
				connection.terminate();
			}
		}
	}, intervalMs);

	if (typeof timer.unref === "function") {
		timer.unref();
	}
	return timer;
}
