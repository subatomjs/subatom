/**
 * @fileoverview Ensures a SubatomServer instance exists and handles graceful shutdown
 * by closing connections before exiting with the given code.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type {
	ErrorMiddlewareHandler,
	MiddlewareHandler,
} from "../../../pipelines/pipeline.types.js";
import type { Router } from "../../router/Router.js";
import type { ISocketRoute } from "../../../socket/types/socket.types.js";
import { SubatomServer } from "../../server/SubatomServer.js";
import type { ISubatomServerConfig } from "../../server/types/subatom.server.types.js";

export function ensureServerInstance(
	currentServer: SubatomServer | undefined,
	router: Router,
	middlewares: MiddlewareHandler[],
	errorMiddlewares: ErrorMiddlewareHandler[],
	customConfig: ISubatomServerConfig,
	wsRoutes: ISocketRoute[],
): SubatomServer {
	if (!currentServer) {
		const server = new SubatomServer(
			router,
			middlewares,
			errorMiddlewares,
			wsRoutes,
		);
		server.setConfig(customConfig);
		return server;
	}
	return currentServer;
}

export function performGracefulShutdown(
	serverInstance: SubatomServer | undefined,
	exitCode: number = 0,
): void {
	console.log("[Subatom] Shutting down active connections...");
	if (serverInstance) {
		serverInstance.close(() => {
			console.log("[Subatom] Server successfully closed.");
			process.exit(exitCode);
		});
	} else {
		process.exit(exitCode);
	}
}
