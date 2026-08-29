/**
 * @fileoverview Gracefully closes all active WebSocket connections, waits for shutdown,
 * and forcefully terminates remaining connections after the timeout.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ConnectionRegistry } from "./connectionRegistry.service.js";

export function shutdownConnections(
	registry: ConnectionRegistry,
	timeoutMs: number,
): Promise<void> {
	return new Promise((resolve) => {
		const connections = Array.from(registry.all());
		if (connections.length === 0) {
			resolve();
			return;
		}

		for (const connection of connections) {
			try {
				connection.close(1001, "Server shutting down");
			} catch {
				connection.terminate();
			}
		}

		let checkInterval: NodeJS.Timeout | undefined;
		let forceTimer: NodeJS.Timeout | undefined;

		const cleanup = () => {
			if (checkInterval) clearInterval(checkInterval);
			if (forceTimer) clearTimeout(forceTimer);
		};

		forceTimer = setTimeout(
			() => {
				cleanup();
				for (const connection of Array.from(registry.all())) {
					try {
						connection.terminate();
					} catch {
						// Ignore errors during emergency force termination
					}
				}
				registry.clear();
				resolve();
			},
			Math.max(timeoutMs, 500),
		);

		if (typeof forceTimer.unref === "function") {
			forceTimer.unref();
		}

		checkInterval = setInterval(() => {
			if (registry.size() === 0) {
				cleanup();
				resolve();
			}
		}, 50);

		if (typeof checkInterval.unref === "function") {
			checkInterval.unref();
		}
	});
}
