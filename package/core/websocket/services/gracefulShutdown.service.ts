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
			connection.close(1001, "Server shutting down");
		}

		const forceTimer = setTimeout(() => {
			for (const connection of registry.all()) connection.terminate();
			resolve();
		}, timeoutMs);
		forceTimer.unref();

		const checkInterval = setInterval(() => {
			if (registry.size() === 0) {
				clearInterval(checkInterval);
				clearTimeout(forceTimer);
				resolve();
			}
		}, 100);
		checkInterval.unref();
	});
}
