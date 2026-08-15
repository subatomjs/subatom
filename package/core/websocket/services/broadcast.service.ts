import type { ConnectionRegistry } from "./connectionRegistry.service.js";

export function broadcastAll(
	registry: ConnectionRegistry,
	data: string | Buffer | object,
	excludeId?: string,
): void {
	for (const connection of registry.all()) {
		if (excludeId && connection.id === excludeId) continue;
		connection.send(data);
	}
}
