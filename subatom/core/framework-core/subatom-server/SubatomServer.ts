import { AsyncLocalStorage } from "node:async_hooks";
import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import type net from "node:net";
import type { Socket } from "node:net";
import type {
	IRequestContext,
	ISubatomServerConfig,
} from "../../../types/framework/core/IFrameworkCore.js";
import type { IRouter } from "../../../types/framework/router/IRouter.js";
import type {
	ErrorMiddlewareHandler,
	MiddlewareHandler,
} from "../../../types/http/IMiddleware.js";

// Single-purpose service imports
import { findAndLoadConfig } from "./services/configLoader.service.js";
import { tryRecoverFromOrphanedRejection } from "./services/orphanRecovery.service.js";
import { getAvailablePort } from "./services/portProber.service.js";
import { processHttpRequest } from "./services/requestHandler.service.js";
import { closeServer } from "./services/serverShutdown.service.js";
import { trackSocket } from "./services/socketTracker.service.js";

export class SubatomServer {
	private readonly server: Server;
	private config: ISubatomServerConfig = {};
	private readonly openSockets = new Set<Socket>();

	/**
	 * Tracks {req, res} for whatever request is "in flight" on the current
	 * async execution context.
	 */
	private readonly requestContext = new AsyncLocalStorage<IRequestContext>();

	constructor(
		private readonly router: IRouter,
		private readonly middlewares: MiddlewareHandler[] = [],
		private readonly errorMiddlewares: ErrorMiddlewareHandler[] = [],
	) {
		this.server = createServer((req, res) => this.handleRequest(req, res));

		this.server.on("connection", (socket: Socket) => {
			trackSocket(this.openSockets, socket);
		});

		this.server.on("clientError", (err: Error, socket: net.Socket) => {
			if (socket.writable) {
				socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
				console.error(
					"[Subatom Warning]: Client connection error:",
					err.message,
				);
			} else {
				socket.destroy();
			}
		});
	}

	public setConfig(config: ISubatomServerConfig): void {
		this.config = { ...this.config, ...config };
	}

	private async handleRequest(
		native_request: IncomingMessage,
		native_response: ServerResponse,
	): Promise<void> {
		await processHttpRequest(
			native_request,
			native_response,
			this.router,
			this.middlewares,
			this.errorMiddlewares,
			this.requestContext,
		);
	}

	public tryRecoverFromOrphanedRejection(reason: unknown): boolean {
		return tryRecoverFromOrphanedRejection(
			this.requestContext,
			this.errorMiddlewares,
			reason,
		);
	}

	public async start(overrideConfig?: ISubatomServerConfig): Promise<Server> {
		const fileConfig = await findAndLoadConfig();
		const mergedConfig = { ...fileConfig, ...this.config, ...overrideConfig };

		const rawPort = process.env.PORT || mergedConfig.port || 8080;
		const host = process.env.HOST || mergedConfig.host || "localhost";
		const appName = mergedConfig.appName || "subatom";

		const requestedPort = Number(rawPort);
		const availablePort = await getAvailablePort(requestedPort, host);

		if (availablePort !== requestedPort) {
			console.warn(
				`[${appName}] Port ${requestedPort} is in use. Automatically switched to ${availablePort}.`,
			);
		}

		return this.server.listen(availablePort, host, () => {
			console.log(`${appName} is running on http://${host}:${availablePort}`);
		});
	}

	public async listen(
		port?: number,
		host?: string,
		appName?: string,
		callback?: (assignedPort: number) => void,
	): Promise<Server> {
		const override: ISubatomServerConfig = {};
		if (port !== undefined) override.port = port;
		if (host !== undefined) override.host = host;
		if (appName !== undefined) override.appName = appName;

		const srv = await this.start(override);

		if (callback) {
			const address = srv.address();
			const actualPort =
				typeof address === "object" && address
					? address.port
					: Number(port || 8080);
			callback(actualPort);
		}

		return srv;
	}

	public close(callback?: (err?: Error) => void): Server {
		const timeoutMs = Number(this.config.shutdownTimeoutMs ?? 10_000);
		return closeServer(this.server, this.openSockets, timeoutMs, callback);
	}
}
