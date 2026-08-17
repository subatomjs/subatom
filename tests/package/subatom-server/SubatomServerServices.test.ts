import { AsyncLocalStorage } from "node:async_hooks";
import { EventEmitter } from "node:events";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	type Mock,
	vi,
} from "vitest";

// =====================================================================
// 1. Mocks setup (Hoisted to module scope)
// =====================================================================

const mockConfigState = vi.hoisted(() => ({
	exports: {} as any,
	shouldFail: false,
}));

vi.mock(`${process.cwd()}/subatom.config.js`, () => {
	if (mockConfigState.shouldFail) {
		throw new Error("File not found");
	}
	return {
		get default() {
			return mockConfigState.exports.default;
		},
		get config() {
			return mockConfigState.exports.config;
		},
	};
});

vi.mock("node:net", () => ({
	default: {
		createServer: vi.fn(),
	},
}));

vi.mock("../../../package/core/http/request/Request.js", () => {
	class Request {
		native: any;
		raw: EventEmitter;
		headers: any;
		constructor(req: any) {
			this.native = req;
			this.raw = req.raw ?? new EventEmitter();
			this.headers = req.headers ?? {};
		}
	}
	return { Request };
});

vi.mock("../../../package/core/http/response/Response.js", () => {
	class Response {
		native: any;
		constructor(res: any) {
			this.native = res;
		}
	}
	return { Response };
});

vi.mock(
	"../../../package/core/pipeline/modifier/RouterPipelineAdapter.js",
	() => ({
		handleRequestWithPipeline: vi.fn(),
	}),
);

vi.mock("../../../package/core/http/errors/errorFormatter.js", () => ({
	ErrorFormatter: { handle: vi.fn() },
}));

vi.mock("../../../package/core/http/errors/Error.js", () => ({
	normalizeError: vi.fn((err) => err),
}));

vi.mock(
	"../../../package/core/bootstrap/subatom-server/services/errorPipeline.service.js",
	async (importOriginal) => {
		const actual =
			await importOriginal<
				typeof import("../../../package/core/bootstrap/subatom-server/services/errorPipeline.service.js")
			>();
		return {
			...actual,
			handleErrorPipeline: vi.fn(actual.handleErrorPipeline),
		};
	},
);

// =====================================================================
// 2. Imports of Tested Services
// =====================================================================

import net from "node:net";
import { findAndLoadConfig } from "../../../package/core/bootstrap/subatom-server/services/configLoader.service.js";
import { handleErrorPipeline } from "../../../package/core/bootstrap/subatom-server/services/errorPipeline.service.js";
import { tryRecoverFromOrphanedRejection } from "../../../package/core/bootstrap/subatom-server/services/orphanRecovery.service.js";
import { getAvailablePort } from "../../../package/core/bootstrap/subatom-server/services/portProber.service.js";
import { processHttpRequest } from "../../../package/core/bootstrap/subatom-server/services/requestHandler.service.js";
import { closeServer } from "../../../package/core/bootstrap/subatom-server/services/serverShutdown.service.js";
import { trackSocket } from "../../../package/core/bootstrap/subatom-server/services/socketTracker.service.js";
import { ErrorFormatter } from "../../../package/core/http/errors/errorFormatter.js";
import { handleRequestWithPipeline } from "../../../package/core/pipeline/modifier/RouterPipelineAdapter.js";

describe("SubatomServer Services", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// =====================================================================
	// Socket Tracker Service
	// =====================================================================
	describe("socketTracker.service", () => {
		it("should add a socket to the openSockets set and remove it on 'close'", () => {
			const openSockets = new Set<Socket>();
			const mockSocket = new EventEmitter() as Socket;

			trackSocket(openSockets, mockSocket);
			expect(openSockets.has(mockSocket)).toBe(true);

			mockSocket.emit("close");
			expect(openSockets.has(mockSocket)).toBe(false);
		});
	});

	// =====================================================================
	// Server Shutdown Service
	// =====================================================================
	describe("serverShutdown.service", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("should close the server gracefully and clear the force timer", () => {
			const mockServer = { close: vi.fn((cb) => cb()) } as unknown as Server;
			const openSockets = new Set<Socket>();
			const callback = vi.fn();

			closeServer(mockServer, openSockets, 10000, callback);

			expect(mockServer.close).toHaveBeenCalledOnce();
			expect(callback).toHaveBeenCalledWith(undefined);

			vi.advanceTimersByTime(10000);
			expect(openSockets.size).toBe(0);
		});

		it("should force-destroy remaining sockets if the timeout is reached", () => {
			const mockServer = { close: vi.fn() } as unknown as Server;
			const mockSocket = { destroy: vi.fn() } as unknown as Socket;
			const openSockets = new Set<Socket>([mockSocket]);
			const consoleWarnSpy = vi
				.spyOn(console, "warn")
				.mockImplementation(() => {});

			closeServer(mockServer, openSockets, 5000);

			vi.advanceTimersByTime(5000);

			expect(consoleWarnSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					"1 connection(s) still open after 5000ms; force-closing.",
				),
			);
			expect(mockSocket.destroy).toHaveBeenCalledOnce();
			expect(openSockets.size).toBe(0);
		});
	});

	// =====================================================================
	// Request Handler Service
	// =====================================================================
	describe("requestHandler.service", () => {
		it("should initialize request metadata and route through the pipeline", async () => {
			const nativeReq = new EventEmitter() as unknown as IncomingMessage;
			(nativeReq as any).headers = {};
			(nativeReq as any).socket = { remoteAddress: "127.0.0.1" };
			(nativeReq as any).raw = nativeReq;

			const nativeRes = {} as ServerResponse;
			const als = new AsyncLocalStorage<any>();

			vi.stubGlobal("performance", { now: () => 1234.5 });
			vi.stubGlobal("crypto", { randomUUID: () => "mock-uuid" });

			await processHttpRequest(
				nativeReq,
				nativeRes,
				{} as any,
				[],
				[],
				als,
				{} as any,
			);

			expect((nativeReq as any).startTime).toBe(1234.5);
			expect((nativeReq as any).id).toBe("mock-uuid");
			expect(handleRequestWithPipeline).toHaveBeenCalledOnce();

			vi.unstubAllGlobals();
		});

		it("should catch pipeline errors and pass them to handleErrorPipeline", async () => {
			const mockError = new Error("Pipeline crashed");
			(handleRequestWithPipeline as Mock).mockRejectedValueOnce(mockError);

			const nativeReq = new EventEmitter() as unknown as IncomingMessage;
			(nativeReq as any).headers = {};
			(nativeReq as any).socket = { remoteAddress: "127.0.0.1" };
			(nativeReq as any).raw = nativeReq;

			const nativeRes = {} as ServerResponse;

			await processHttpRequest(
				nativeReq,
				nativeRes,
				{} as any,
				[],
				[],
				new AsyncLocalStorage(),
				{} as any,
			);

			expect(handleErrorPipeline).toHaveBeenCalledWith(
				mockError,
				expect.any(Object),
				expect.any(Object),
				[],
			);
		});
	});

	// =====================================================================
	// Port Prober Service
	// =====================================================================
	describe("portProber.service", () => {
		it("should resolve the port immediately if it is available", async () => {
			const mockProbe = {
				once: vi.fn((event, cb) => {
					if (event === "listening") cb();
				}),
				listen: vi.fn(),
				close: vi.fn((cb) => cb()),
			};
			(net.createServer as Mock).mockReturnValue(mockProbe);

			const port = await getAvailablePort(8080, "localhost");
			expect(port).toBe(8080);
			expect(mockProbe.listen).toHaveBeenCalledWith(8080, "localhost");
		});

		it("should retry the same port after 100ms if EADDRINUSE and retries left", async () => {
			let listenCount = 0;
			const mockProbe = {
				once: vi.fn((event, cb) => {
					if (event === "error" && listenCount === 0) {
						listenCount++;
						cb({ code: "EADDRINUSE" });
					} else if (event === "listening" && listenCount === 1) {
						cb();
					}
				}),
				listen: vi.fn(),
				close: vi.fn((cb) => cb()),
			};
			(net.createServer as Mock).mockReturnValue(mockProbe);

			const port = await getAvailablePort(8080, "localhost", 1);
			expect(port).toBe(8080);
		});

		it("should increment port and reset retries if EADDRINUSE exhausts retries", async () => {
			let attempts = 0;
			const mockProbe = {
				once: vi.fn((event, cb) => {
					if (event === "error" && attempts < 1) {
						attempts++;
						cb({ code: "EADDRINUSE" });
					} else if (event === "listening") {
						cb();
					}
				}),
				listen: vi.fn(),
				close: vi.fn((cb) => cb()),
			};
			(net.createServer as Mock).mockReturnValue(mockProbe);

			const port = await getAvailablePort(8080, "localhost", 0);
			expect(port).toBe(8081);
		});

		it("should reject immediately if an unknown error occurs", async () => {
			const unknownErr = { code: "EACCES" };
			const mockProbe = {
				once: vi.fn((event, cb) => {
					if (event === "error") cb(unknownErr);
				}),
				listen: vi.fn(),
				close: vi.fn(),
			};
			(net.createServer as Mock).mockReturnValue(mockProbe);

			await expect(getAvailablePort(80, "localhost")).rejects.toEqual(
				unknownErr,
			);
		});
	});

	// =====================================================================
	// Orphan Recovery Service
	// =====================================================================
	describe("orphanRecovery.service", () => {
		let als: AsyncLocalStorage<any>;

		beforeEach(() => {
			als = new AsyncLocalStorage();
		});

		it("should return false if there is no context in the store", () => {
			const result = tryRecoverFromOrphanedRejection(als, [], new Error());
			expect(result).toBe(false);
		});

		it("should return false if response is already ended", () => {
			const mockReq = {};
			const mockRes = { writableEnded: true, headersSent: false };

			als.run({ req: mockReq, res: mockRes }, () => {
				const result = tryRecoverFromOrphanedRejection(als, [], new Error());
				expect(result).toBe(false);
			});
		});

		it("should return true and route to error pipeline if response is still active", () => {
			const mockReq = {};
			const mockRes = { writableEnded: false, headersSent: false };
			const reason = new Error("Orphaned");
			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			(handleErrorPipeline as Mock).mockClear();

			let result;
			als.run({ req: mockReq, res: mockRes }, () => {
				result = tryRecoverFromOrphanedRejection(als, [], reason);
			});

			expect(result).toBe(true);
			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining("Recovered an orphaned promise"),
			);
			expect(handleErrorPipeline).toHaveBeenCalledWith(
				reason,
				mockReq,
				mockRes,
				[],
			);
		});
	});

	// =====================================================================
	// Error Pipeline Service
	// =====================================================================
	describe("errorPipeline.service", () => {
		it("should bail early if response is already writableEnded", async () => {
			const mockRes = { writableEnded: true } as any;
			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			const { handleErrorPipeline: actualErrorPipeline } =
				await vi.importActual<any>(
					"../../../package/core/bootstrap/subatom-server/services/errorPipeline.service.js",
				);

			await actualErrorPipeline(new Error(), {} as any, mockRes, []);

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				"[SubatomServer Warning]: Error occurred after response was sent:",
				expect.any(Error),
			);
			expect(ErrorFormatter.handle).not.toHaveBeenCalled();
		});

		it("should iterate through error middlewares and fallback to ErrorFormatter", async () => {
			const mockRes = { writableEnded: false } as any;
			const initialErr = new Error("Start");

			const mw1 = vi.fn(async (_err, _req, _res, next) => {
				await next(new Error("Modified by mw1"));
			});
			const mw2 = vi.fn(async (err, _req, _res, next) => {
				await next(err);
			});

			const { handleErrorPipeline: actualErrorPipeline } =
				await vi.importActual<any>(
					"../../../package/core/bootstrap/subatom-server/services/errorPipeline.service.js",
				);

			await actualErrorPipeline(initialErr, {} as any, mockRes, [mw1, mw2]);

			expect(mw1).toHaveBeenCalledOnce();
			expect(mw2).toHaveBeenCalledOnce();
			expect(ErrorFormatter.handle).toHaveBeenCalledWith(
				expect.objectContaining({ message: "Modified by mw1" }),
				expect.any(Object),
				mockRes,
			);
		});

		it("should catch exceptions thrown inside an error middleware and pass to next", async () => {
			const mockRes = { writableEnded: false } as any;

			const throwingMw = vi.fn(() => {
				throw new Error("Mw Crashed");
			});

			const { handleErrorPipeline: actualErrorPipeline } =
				await vi.importActual<any>(
					"../../../package/core/bootstrap/subatom-server/services/errorPipeline.service.js",
				);

			await actualErrorPipeline(new Error(), {} as any, mockRes, [
				throwingMw as any,
			]);

			expect(ErrorFormatter.handle).toHaveBeenCalledWith(
				expect.objectContaining({ message: "Mw Crashed" }),
				expect.any(Object),
				mockRes,
			);
		});
	});

	// =====================================================================
	// Config Loader Service
	// =====================================================================
	describe("configLoader.service", () => {
		beforeEach(() => {
			mockConfigState.exports = {};
			mockConfigState.shouldFail = false;
		});

		it("should return empty object if import throws an error", async () => {
			mockConfigState.shouldFail = true;

			const config = await findAndLoadConfig();
			expect(config).toEqual({});
		});

		it("should load config.default if present", async () => {
			mockConfigState.exports = { default: { port: 3000 } };

			const config = await findAndLoadConfig();
			expect(config).toEqual({ port: 3000 });
		});

		it("should load config.config as fallback", async () => {
			mockConfigState.exports = { config: { port: 4000 } };

			const config = await findAndLoadConfig();
			expect(config).toEqual({ port: 4000 });
		});
	});
});
