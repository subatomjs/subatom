/**
 * @fileoverview Manages the Subatom HTTP server lifecycle, configuration, middleware,
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
import { listenOnPort } from "./services/portProber.service.js";
import { processHttpRequest } from "./services/requestHandler.service.js";
import { closeServer } from "./services/serverShutdown.service.js";
import { trackSocket } from "./services/socketTracker.service.js";
import type {
	IRequestContext,
	ISubatomServerMetrics,
	ISubatomServerConfig,
} from "./types/subatom.server.types.js";
import type { IRequestPipelineConfig } from "../../pipelines/modifiers/types/modifiers.types.js";
import type { IRouter } from "../router/types/router.types.js";
import type {
	ErrorMiddlewareHandler,
	MiddlewareHandler,
} from "../../pipelines/pipeline.types.js";
import { ConfigManager } from "../../../config/ConfigManager.js";
import type { ISubatomConfig } from "../../../config/types/subatom.config.types.js";

export class SubatomServer {
	private readonly server: Server;
	private config: ISubatomServerConfig = {};

	private readonly openSockets = new Set<Socket>();
	private activeRequests = 0;
	private totalRequests = 0;
	private failedRequests = 0;
	private acceptingRequests = false;
	private maxConcurrentRequests = 0;

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
	) {
		this.server = createServer((req, res) => {
			if (
				!this.acceptingRequests ||
				(this.maxConcurrentRequests > 0 &&
					this.activeRequests >= this.maxConcurrentRequests)
			) {
				res.statusCode = 503;
				res.setHeader("Retry-After", "1");
				res.end("Service Unavailable");
				return;
			}

			this.activeRequests += 1;
			this.totalRequests += 1;
			void this.handleRequest(req, res)
				.catch((error: unknown) => {
					this.failedRequests += 1;
					console.error("[SubatomServer] Unhandled request failure:", error);
					if (res.writableEnded || res.destroyed) return;
					res.statusCode = 500;
					res.setHeader("Content-Type", "application/json; charset=utf-8");
					res.end(JSON.stringify({ error: "Internal Server Error" }));
				})
				.finally(() => {
					this.activeRequests -= 1;
				});
		});

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
			safeOverrides as ISubatomConfig,
		);

		const requestedPort = Number(finalConfig.port);
		const host = finalConfig.host;
		this.server.headersTimeout = this.positiveTimeout(
			combinedOverrides.headersTimeout,
			60_000,
		);
		this.server.requestTimeout = this.positiveTimeout(
			combinedOverrides.requestTimeout,
			30_000,
		);
		this.server.keepAliveTimeout = this.positiveTimeout(
			combinedOverrides.keepAliveTimeout,
			5_000,
		);
		this.server.maxConnections = this.positiveInteger(
			combinedOverrides.maxConnections,
			10_000,
		);
		this.maxConcurrentRequests = this.nonNegativeInteger(
			combinedOverrides.maxConcurrentRequests,
			0,
		);
		const appName =
			(finalConfig as unknown as ISubatomServerConfig).appName ||
			combinedOverrides.appName ||
			"subatom";

		const server = await listenOnPort(this.server, requestedPort, host);
		this.acceptingRequests = true;
		console.log(`${appName} is running on http://${host}:${requestedPort}`);
		return server;
	}

	private positiveTimeout(value: unknown, fallback: number): number {
		const timeout = Number(value ?? fallback);
		return Number.isFinite(timeout) && timeout > 0 ? timeout : fallback;
	}

	private positiveInteger(value: unknown, fallback: number): number {
		const limit = Number(value ?? fallback);
		return Number.isSafeInteger(limit) && limit > 0 ? limit : fallback;
	}

	private nonNegativeInteger(value: unknown, fallback: number): number {
		const limit = Number(value ?? fallback);
		return Number.isSafeInteger(limit) && limit >= 0 ? limit : fallback;
	}

	public getMetrics(): ISubatomServerMetrics {
		return {
			activeRequests: this.activeRequests,
			totalRequests: this.totalRequests,
			failedRequests: this.failedRequests,
			accepted: this.acceptingRequests,
		};
	}

	public getHealth(): ISubatomServerMetrics & { healthy: boolean } {
		const metrics = this.getMetrics();
		return { ...metrics, healthy: metrics.accepted };
	}

	public close(callback?: (err?: Error) => void): Server {
		this.acceptingRequests = false;
		const timeoutMs = Number(this.config.shutdownTimeoutMs ?? 10_000);
		return closeServer(this.server, this.openSockets, timeoutMs, callback);
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
}
