/**
 * @fileoverview Manages the Subatom HTTP server lifecycle, configuration, middleware, WebSocket integration,
 * request handling, port selection, socket tracking, and graceful shutdown.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { AsyncLocalStorage } from "node:async_hooks";
import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import type net from "node:net";
import type { Socket } from "node:net";
import type { Router } from "../router/Router.js";
import { tryRecoverFromOrphanedRejection } from "./services/orphanRecovery.service.js";
import { getAvailablePort } from "./services/portProber.service.js";
import { processHttpRequest } from "./services/requestHandler.service.js";
import { closeServer } from "./services/serverShutdown.service.js";
import { trackSocket } from "./services/socketTracker.service.js";
import type {
	IRequestContext,
	ISubatomServerConfig,
} from "./types/subatom.server.types.js";
import { SocketManager } from "../../socket/SocketManager.js";
import type { IRequestPipelineConfig } from "../../pipelines/modifiers/types/modifiers.types.js";
import type { IRouter } from "../router/types/router.types.js";
import type {
	ErrorMiddlewareHandler,
	MiddlewareHandler,
} from "../../pipelines/pipeline.types.js";
import type { ISocketRoute } from "../../socket/types/socket.types.js";
import { ConfigManager } from "../../../config/ConfigManager.js";
import type {
	SubatomConfig,
	ISubatomConfig,
} from "../../../config/types/subatom.config.types.js";

export class SubatomServer {
	private readonly server: Server;
	private config: ISubatomServerConfig = {};
	private resolvedConfig: Partial<SubatomConfig> = {};

	private readonly openSockets = new Set<Socket>();
	private readonly webSocketManager: SocketManager;

	private pipelineConfig: IRequestPipelineConfig = {
		transformers: [],
		interceptors: [],
		serializers: [],
	};

	private readonly requestContext = new AsyncLocalStorage<IRequestContext>();

	constructor(
		private readonly router: Router | IRouter,
		private readonly middlewares: MiddlewareHandler[] = [],
		private readonly errorMiddlewares: ErrorMiddlewareHandler[] = [],
		private readonly wsRoutes: ISocketRoute[] = [],
	) {
		this.server = createServer((req, res) => this.handleRequest(req, res));
		this.webSocketManager = new SocketManager(this.server);

		for (const route of this.wsRoutes) {
			this.webSocketManager.register(route.path, route.handlers);
		}

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

	public setPipelineConfig(config: IRequestPipelineConfig): void {
		this.pipelineConfig = config;
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
			this.pipelineConfig,
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
		const combinedOverrides = { ...this.config, ...overrideConfig };

		let safeOverrides: ISubatomConfig | undefined;
		if (Object.keys(combinedOverrides).length > 0) {
			const overridesRecord: Record<string, unknown> = {};
			for (const [key, value] of Object.entries(combinedOverrides)) {
				if (value !== undefined) {
					if (key === "port") {
						overridesRecord.port = Number(value);
					} else {
						overridesRecord[key] = value;
					}
				}
			}
			safeOverrides = overridesRecord as ISubatomConfig;
		}

		const finalConfig = await ConfigManager.resolve(
			safeOverrides as SubatomConfig,
		);
		this.resolvedConfig = finalConfig;

		if (finalConfig.websocket && finalConfig.websocketOptions) {
			this.webSocketManager.activate(finalConfig.websocketOptions);
		}

		const requestedPort = Number(finalConfig.port);
		const host = finalConfig.host;
		const appName =
			(finalConfig as unknown as ISubatomServerConfig).appName ||
			combinedOverrides.appName ||
			"subatom";

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
		const timeoutMs = Number(
			this.resolvedConfig.websocketOptions?.shutdownTimeoutMs ??
				this.config.shutdownTimeoutMs ??
				10_000,
		);
		void this.webSocketManager.shutdown(timeoutMs);
		return closeServer(this.server, this.openSockets, timeoutMs, callback);
	}

	public get webSocket(): SocketManager {
		return this.webSocketManager;
	}
}
