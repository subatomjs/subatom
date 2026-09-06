/// <reference types="node" />clear

/** biome-ignore-all lint/complexity/useLiteralKeys: explanation */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { EventEmitter } from "node:events";

let capturedHandler:
	| ((req: IncomingMessage, res: ServerResponse) => void)
	| undefined;

const getCapturedHandler = () => {
	if (!capturedHandler) {
		throw new Error("Expected the HTTP request handler to be captured");
	}
	return capturedHandler;
};
const mockHttpServer = Object.assign(new EventEmitter(), {
	listen: vi.fn(),
	close: vi.fn((cb?: (err?: Error) => void) => {
		cb?.();
		return mockHttpServer;
	}),
	address: vi.fn().mockReturnValue({ port: 3000, address: "127.0.0.1" }),
	headersTimeout: 0,
	requestTimeout: 0,
	keepAliveTimeout: 0,
	maxConnections: 0,
});

vi.mock("node:http", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:http")>();
	return {
		...actual,
		default: {
			...actual,
			createServer: vi.fn(
				(handler?: (req: IncomingMessage, res: ServerResponse) => void) => {
					capturedHandler = handler;
					return mockHttpServer;
				},
			),
		},
		createServer: vi.fn(
			(handler?: (req: IncomingMessage, res: ServerResponse) => void) => {
				capturedHandler = handler;
				return mockHttpServer;
			},
		),
	};
});

vi.mock(
	"../../../../packages/core/server/services/portProber.service.js",
	() => ({
		listenOnPort: vi.fn(),
	}),
);

import { SubatomServer } from "../../../../packages/core/server/SubatomServer.js";
import type { IRouter } from "../../../../packages/core/router/types/router.types.js";
import type { IRequestPipelineConfig } from "../../../../packages/pipelines/modifiers/types/modifiers.types.js";
import { ConfigManager } from "../../../../config/ConfigManager.js";
import * as requestHandlerModule from "../../../../packages/core/server/services/requestHandler.service.js";
import * as serverShutdownModule from "../../../../packages/core/server/services/serverShutdown.service.js";
import * as orphanRecoveryModule from "../../../../packages/core/server/services/orphanRecovery.service.js";
import * as socketTrackerModule from "../../../../packages/core/server/services/socketTracker.service.js";
import { listenOnPort } from "../../../../packages/core/server/services/portProber.service.js";

describe("SubatomServer", () => {
	let mockRouter: IRouter;

	beforeEach(() => {
		vi.clearAllMocks();
		mockHttpServer.removeAllListeners();
		capturedHandler = undefined;
		mockRouter = {} as IRouter;
		vi.mocked(listenOnPort).mockResolvedValue(
			mockHttpServer as unknown as import("node:http").Server,
		);
		vi.spyOn(ConfigManager, "resolve").mockResolvedValue({
			port: 8080,
			host: "0.0.0.0",
		} as unknown as never);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("Request Reception & Concurrency Control", () => {
		it("should reject with 503 if server is not yet accepting requests", () => {
			new SubatomServer(mockRouter);

			const setHeader = vi.fn();
			const end = vi.fn();
			const res = {
				statusCode: 200,
				setHeader,
				end,
			} as unknown as ServerResponse;
			const req = {} as IncomingMessage;

			expect(capturedHandler).toBeDefined();
			getCapturedHandler()(req, res);

			expect(res.statusCode).toBe(503);
			expect(setHeader).toHaveBeenCalledWith("Retry-After", "1");
			expect(end).toHaveBeenCalledWith("Service Unavailable");
		});

		it("should reject with 503 if activeRequests exceeds maxConcurrentRequests", async () => {
			const server = new SubatomServer(mockRouter);
			await server.start({ maxConcurrentRequests: 1 });

			vi.spyOn(requestHandlerModule, "processHttpRequest").mockReturnValue(
				new Promise(() => {}),
			);

			const res1 = {
				statusCode: 200,
				setHeader: vi.fn(),
				end: vi.fn(),
			} as unknown as ServerResponse;
			const res2 = {
				statusCode: 200,
				setHeader: vi.fn(),
				end: vi.fn(),
			} as unknown as ServerResponse;
			const req = {} as IncomingMessage;

			getCapturedHandler()(req, res1);
			expect(server.getMetrics().activeRequests).toBe(1);

			getCapturedHandler()(req, res2);
			expect(res2.statusCode).toBe(503);
			expect(res2.end).toHaveBeenCalledWith("Service Unavailable");
		});

		it("should process request and update metrics correctly on success", async () => {
			const server = new SubatomServer(mockRouter);
			await server.start();

			vi.spyOn(requestHandlerModule, "processHttpRequest").mockResolvedValue();

			const res = { statusCode: 200 } as unknown as ServerResponse;
			const req = {} as IncomingMessage;

			getCapturedHandler()(req, res);
			await new Promise((resolve) => setTimeout(resolve, 0));

			const metrics = server.getMetrics();
			expect(metrics.totalRequests).toBe(1);
			expect(metrics.activeRequests).toBe(0);
			expect(metrics.failedRequests).toBe(0);
		});

		it("should catch unhandled request rejection, write 500 JSON, and increment failedRequests", async () => {
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});
			const server = new SubatomServer(mockRouter);
			await server.start();

			const unhandledError = new Error("Catastrophic error");
			vi.spyOn(requestHandlerModule, "processHttpRequest").mockRejectedValue(
				unhandledError,
			);

			const res = {
				statusCode: 200,
				writableEnded: false,
				destroyed: false,
				setHeader: vi.fn(),
				end: vi.fn(),
			} as unknown as ServerResponse;
			const req = {} as IncomingMessage;

			getCapturedHandler()(req, res);
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(consoleSpy).toHaveBeenCalledWith(
				"[SubatomServer] Unhandled request failure:",
				unhandledError,
			);
			expect(res.statusCode).toBe(500);
			expect(res.setHeader).toHaveBeenCalledWith(
				"Content-Type",
				"application/json; charset=utf-8",
			);
			expect(res.end).toHaveBeenCalledWith(
				JSON.stringify({ error: "Internal Server Error" }),
			);
			expect(server.getMetrics().failedRequests).toBe(1);
			expect(server.getMetrics().activeRequests).toBe(0);
		});

		it("should skip writing 500 if response is already writableEnded or destroyed", async () => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			const server = new SubatomServer(mockRouter);
			await server.start();

			vi.spyOn(requestHandlerModule, "processHttpRequest").mockRejectedValue(
				new Error("Err"),
			);

			const res = {
				statusCode: 200,
				writableEnded: true,
				destroyed: false,
				setHeader: vi.fn(),
				end: vi.fn(),
			} as unknown as ServerResponse;

			getCapturedHandler()({} as IncomingMessage, res);
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(res.statusCode).toBe(200);
			expect(res.end).not.toHaveBeenCalled();
			expect(server.getMetrics().failedRequests).toBe(1);
		});
	});

	describe("Socket and Client Error Handlers", () => {
		it("should delegate new connections to trackSocket", () => {
			const trackSpy = vi.spyOn(socketTrackerModule, "trackSocket");
			new SubatomServer(mockRouter);

			const dummySocket = Object.assign(new EventEmitter(), {
				destroy: vi.fn(),
			}) as unknown as Socket;

			mockHttpServer.emit("connection", dummySocket);

			expect(trackSpy).toHaveBeenCalledWith(expect.any(Set), dummySocket);
		});

		it("should respond with 400 Bad Request if clientError socket is writable", () => {
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});
			new SubatomServer(mockRouter);

			const dummySocket = {
				writable: true,
				end: vi.fn(),
				destroy: vi.fn(),
			} as unknown as Socket;

			mockHttpServer.emit("clientError", new Error("Parse error"), dummySocket);

			expect(dummySocket.end).toHaveBeenCalledWith(
				"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n",
			);
			expect(dummySocket.destroy).not.toHaveBeenCalled();
			expect(consoleSpy).toHaveBeenCalledWith(
				"[Subatom Warning]: Client connection error:",
				"Parse error",
			);
		});

		it("should destroy clientError socket immediately if not writable", () => {
			new SubatomServer(mockRouter);

			const dummySocket = {
				writable: false,
				end: vi.fn(),
				destroy: vi.fn(),
			} as unknown as Socket;

			mockHttpServer.emit("clientError", new Error("Dead socket"), dummySocket);

			expect(dummySocket.destroy).toHaveBeenCalledTimes(1);
			expect(dummySocket.end).not.toHaveBeenCalled();
		});
	});

	describe("Configuration & Startup Logic", () => {
		it("should apply timeout and connection limits using fallbacks for invalid values", async () => {
			const server = new SubatomServer(mockRouter);
			vi.spyOn(ConfigManager, "resolve").mockResolvedValue({
				port: 9000,
				host: "127.0.0.1",
			} as unknown as never);

			server.setConfig({
				headersTimeout: -100,
				requestTimeout: "invalid" as unknown as number,
				keepAliveTimeout: 0,
				maxConnections: -5,
				maxConcurrentRequests: -10,
			});

			await server.start();

			expect(mockHttpServer.headersTimeout).toBe(60_000);
			expect(mockHttpServer.requestTimeout).toBe(30_000);
			expect(mockHttpServer.keepAliveTimeout).toBe(5_000);
			expect(mockHttpServer.maxConnections).toBe(10_000);
		});

		it("should apply valid numeric values for timeouts and connection limits", async () => {
			const server = new SubatomServer(mockRouter);
			vi.spyOn(ConfigManager, "resolve").mockResolvedValue({
				port: "9000",
				host: "127.0.0.1",
				appName: "CustomApp",
			} as unknown as never);

			await server.start({
				headersTimeout: 120_000,
				requestTimeout: 45_000,
				keepAliveTimeout: 10_000,
				maxConnections: 5_000,
				maxConcurrentRequests: 250,
			});

			expect(mockHttpServer.headersTimeout).toBe(120_000);
			expect(mockHttpServer.requestTimeout).toBe(45_000);
			expect(mockHttpServer.keepAliveTimeout).toBe(10_000);
			expect(mockHttpServer.maxConnections).toBe(5_000);
		});

		it("should properly assign pipeline configuration with setPipelineConfig", () => {
			const server = new SubatomServer(mockRouter);
			const customPipeline: IRequestPipelineConfig = {
				transformers: [],
				interceptors: [],
				serializers: [],
			};

			server.setPipelineConfig(customPipeline);
			expect(Reflect.get(server, "pipelineConfig")).toBe(customPipeline);
		});
	});

	describe("Metrics, Health, and Recovery", () => {
		it("should report health matching getMetrics and accepted state", async () => {
			const server = new SubatomServer(mockRouter);
			expect(server.getHealth()).toEqual({
				activeRequests: 0,
				totalRequests: 0,
				failedRequests: 0,
				accepted: false,
				healthy: false,
			});

			vi.spyOn(ConfigManager, "resolve").mockResolvedValue({
				port: 8080,
				host: "localhost",
			} as unknown as never);

			await server.start();
			expect(server.getHealth().healthy).toBe(true);
		});

		it("should delegate tryRecoverFromOrphanedRejection to service", () => {
			const spy = vi
				.spyOn(orphanRecoveryModule, "tryRecoverFromOrphanedRejection")
				.mockReturnValue(true);
			const server = new SubatomServer(mockRouter);

			const result = server.tryRecoverFromOrphanedRejection("some reason");

			expect(result).toBe(true);
			expect(spy).toHaveBeenCalledWith(
				server["requestContext"],
				server["errorMiddlewares"],
				"some reason",
			);
		});
	});

	describe("Close and Listen", () => {
		it("should invoke closeServer and reset acceptingRequests to false on close()", () => {
			const spy = vi
				.spyOn(serverShutdownModule, "closeServer")
				.mockReturnValue(
					mockHttpServer as unknown as import("node:http").Server,
				);
			const server = new SubatomServer(mockRouter);
			const cb = vi.fn();

			server.close(cb);

			expect(server.getMetrics().accepted).toBe(false);
			expect(spy).toHaveBeenCalledWith(
				mockHttpServer,
				server["openSockets"],
				10_000,
				cb,
			);
		});

		it("should listen() and trigger callback with actual bound port", async () => {
			vi.spyOn(ConfigManager, "resolve").mockResolvedValue({
				port: 4200,
				host: "localhost",
			} as unknown as never);

			const server = new SubatomServer(mockRouter);
			const callback = vi.fn();

			mockHttpServer.address.mockReturnValue({
				port: 4200,
				address: "127.0.0.1",
			});

			const srv = await server.listen(4200, "localhost", "TestApp", callback);

			expect(srv).toBe(mockHttpServer);
			expect(callback).toHaveBeenCalledWith(4200);
		});

		it("should fallback to port or 8080 in listen() callback if address is non-object string", async () => {
			vi.spyOn(ConfigManager, "resolve").mockResolvedValue({
				port: 8080,
				host: "localhost",
			} as unknown as never);

			const server = new SubatomServer(mockRouter);
			const callback = vi.fn();

			mockHttpServer.address.mockReturnValue("pipe-address");

			await server.listen(undefined, undefined, undefined, callback);

			expect(callback).toHaveBeenCalledWith(8080);
		});
	});
});
