// /subatom/package/core/bootstrap/subatom-server/services/serverShutdown.service.ts
import type { Server } from "node:http";
import type { Socket } from "node:net";

export function closeServer(
	server: Server,
	openSockets: Set<Socket>,
	shutdownTimeoutMs: number = 10_000,
	callback?: (err?: Error) => void,
): Server {
	const forceTimer = setTimeout(() => {
		if (openSockets.size > 0) {
			console.warn(
				`[SubatomServer Warning]: ${openSockets.size} connection(s) still open after ${shutdownTimeoutMs}ms; force-closing.`,
			);
		}
		for (const socket of openSockets) {
			socket.destroy();
		}
		openSockets.clear();
	}, shutdownTimeoutMs);

	if (typeof forceTimer.unref === "function") {
		forceTimer.unref();
	}

	return server.close((err) => {
		clearTimeout(forceTimer);
		callback?.(err);
	});
}
