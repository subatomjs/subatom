/**
 * @fileoverview Binds the HTTP server directly to the requested port and reports
 * address conflicts without a separate time-of-check/time-of-use probe.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { Server } from "node:http";

export function listenOnPort(
	server: Server,
	port: number,
	host: string,
): Promise<Server> {
	return new Promise((resolve, reject) => {
		const onError = (error: NodeJS.ErrnoException) => {
			server.off("listening", onListening);
			if (error.code === "EADDRINUSE") {
				reject(new Error(`Port ${port} is already in use.`));
				return;
			}
			reject(error);
		};
		const onListening = () => {
			server.off("error", onError);
			resolve(server);
		};

		server.once("error", onError);
		server.once("listening", onListening);
		server.listen(port, host);
	});
}
