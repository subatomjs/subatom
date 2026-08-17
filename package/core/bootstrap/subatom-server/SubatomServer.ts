/*!
 * subatom
 * Copyright(c) 2026 Kunal Chandra Das <kunalchandradasofficial@gmail.com.
 * MIT Licensed
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
import { ConfigManager } from "../../../config/ConfigManager.js";
import type {
	IRequestContext,
	ISubatomServerConfig,
} from "../../../types/framework/core/IFrameworkCore.js";
import type { IRouter } from "../../../types/framework/router/IRouter.js";
import type {
	ErrorMiddlewareHandler,
	MiddlewareHandler,
} from "../../../types/http/IMiddleware.js";
import type { IWebSocketRoute } from "../../../types/websocket/IWebSocket.js";
import type { IRequestPipelineConfig } from "../../pipeline/modifier/RequestPipeline.js";
// Import the concrete Router class
import type { Router } from "../../router/Router.js";
import { WebSocketManager } from "../../websocket/WebSocketManager.js";
// Single-purpose service imports
import { tryRecoverFromOrphanedRejection } from "./services/orphanRecovery.service.js";
import { getAvailablePort } from "./services/portProber.service.js";
import { processHttpRequest } from "./services/requestHandler.service.js";
import { closeServer } from "./services/serverShutdown.service.js";
import { trackSocket } from "./services/socketTracker.service.js";

// [UPDATE FOR NEW ENV CONFIG]:
// Replaced the old isolated `findAndLoadConfig` with the new centralized ConfigManager.

export class SubatomServer {
	private readonly server: Server;

	// Fully restored original config property to support setConfig API
	private config: ISubatomServerConfig = {};

	// [UPDATE FOR NEW ENV CONFIG]:
	// Added this to cache the final, strictly validated configuration pipeline.
	// This ensures methods like close() have access to reliable, merged values.
	private resolvedConfig: any = {};

	private readonly openSockets = new Set<Socket>();
	private readonly webSocketManager: WebSocketManager;

	private pipelineConfig: IRequestPipelineConfig = {
		transformers: [],
		interceptors: [],
		serializers: [],
	};

	private readonly requestContext = new AsyncLocalStorage<IRequestContext>();

	constructor(
		// Router
		private readonly router: Router | IRouter,

		// Middlewares
		private readonly middlewares: MiddlewareHandler[] = [],
		private readonly errorMiddlewares: ErrorMiddlewareHandler[] = [],

		// Websocket
		private readonly wsRoutes: IWebSocketRoute[] = [],
	) {
		// Http server creation
		this.server = createServer((req, res) => this.handleRequest(req, res));

		// Websocket connection
		this.webSocketManager = new WebSocketManager(this.server);
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

	// Feature: Keeps the public API intact for any middleware or plugins modifying config before start.
	public setConfig(config: ISubatomServerConfig): void {
		this.config = { ...this.config, ...config };
	}

	// Feature: Keeps pipeline configuration intact.
	public setPipelineConfig(config: IRequestPipelineConfig): void {
		this.pipelineConfig = config;
	}

	// Request response handler
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
		// 1. First, we merge your legacy instance config (from `setConfig`) with any explicit `start(overrides)`.
		const combinedOverrides = { ...this.config, ...overrideConfig };

		// 2. We sanitize these legacy overrides into the strict typing the new ConfigManager expects.
		// For example, resolving the strict `number` requirement for the `port` property.
		let safeOverrides: any;
		if (Object.keys(combinedOverrides).length > 0) {
			safeOverrides = {};
			for (const [key, value] of Object.entries(combinedOverrides)) {
				if (value !== undefined) {
					if (key === "port") {
						safeOverrides.port = Number(value);
					} else {
						safeOverrides[key] = value;
					}
				}
			}
		}
		// 3. We delegate to the unified ConfigManager. It will handle the `.env` discovery,
		// `subatom.config.*` loading, deep merging, validation, and immutability.
		const finalConfig = await ConfigManager.resolve(safeOverrides);
		this.resolvedConfig = finalConfig; // Cache for the server lifecycle

		// [UPDATE FOR NEW ENV CONFIG]:
		// 4. We rely entirely on the validated source of truth (`finalConfig`) instead of `process.env`.
		if (finalConfig.websocket) {
			this.webSocketManager.activate(finalConfig.websocketOptions);
		}

		const requestedPort = Number(finalConfig.port);
		const host = finalConfig.host;
		// Fallback for appName, since it might not be explicitly typed in SubatomConfig yet
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
		// Feature: Fully intact wrapper around start().
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
		// Fallback securely through the pipeline: 1. Resolved deep merged config, 2. Legacy config, 3. Default.
		const timeoutMs = Number(
			this.resolvedConfig?.websocketOptions?.shutdownTimeoutMs ??
				this.config.shutdownTimeoutMs ??
				10_000,
		);
		void this.webSocketManager.shutdown(timeoutMs);
		return closeServer(this.server, this.openSockets, timeoutMs, callback);
	}

	public get webSocket(): WebSocketManager {
		return this.webSocketManager;
	}
}
