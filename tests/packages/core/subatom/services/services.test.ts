import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	ErrorMiddlewareHandler,
	MiddlewareHandler,
} from "../../../../../packages/pipelines/pipeline.types.js";
import { registerMiddleware } from "../../../../../packages/core/subatom/services/middlewareRegistrar.service.js";
import {
	ensureServerInstance,
	performGracefulShutdown,
} from "../../../../../packages/core/subatom/services/serverManager.service.js";
import { dispatchGroup } from "../../../../../packages/core/subatom/services/groupDispatcher.service.js";
import { registerProcessBoundary } from "../../../../../packages/core/subatom/services/processBoundary.service.js";
import { RouteGroupBuilder } from "../../../../../packages/core/subatom/subordinate/RouteGroupBuilder.js";
import type { SubatomServer } from "../../../../../packages/core/server/SubatomServer.js";
import type { Router } from "../../../../../packages/core/router/Router.js";
import type { IRouter } from "../../../../../packages/core/router/types/router.types.js";
import type { Subatom } from "../../../../../packages/core/subatom/Subatom.js";

vi.mock("../../../../../packages/core/server/SubatomServer.js", () => {
	return {
		SubatomServer: class {
			public setConfig = vi.fn();
			public close = vi.fn((cb: () => void) => cb());
			public tryRecoverFromOrphanedRejection = vi.fn(() => false);
		},
	};
});

vi.mock(
	"../../../../../packages/core/router/helpers/isRouterInstance.js",
	() => {
		return {
			default: (obj: unknown): boolean =>
				Boolean(obj && typeof obj === "object" && "_isRouter" in obj),
		};
	},
);

vi.mock(
	"../../../../../packages/core/router/services/routerMerger.service.js",
	() => {
		return {
			mergeSubRouter: vi.fn(),
		};
	},
);

vi.mock("../../../../../config/env/env.js", () => {
	return {
		env: {
			get isProd(): boolean {
				return true;
			},
		},
		configEnv: vi.fn(),
	};
});

vi.mock("../../../../../packages/core/subatom/config/env/env.js", () => {
	return {
		env: {
			get isProd(): boolean {
				return true;
			},
		},
		configEnv: vi.fn(),
	};
});

describe("Services: middlewareRegistrar", () => {
	it("should categorize 3-arg functions as standard middleware and 4-arg functions as error middleware", () => {
		const middlewares: MiddlewareHandler[] = [];
		const errorMiddlewares: ErrorMiddlewareHandler[] = [];

		const standard: MiddlewareHandler = (_req, _res, next) => next();
		const errHandler: ErrorMiddlewareHandler = (_err, _req, _res, next) =>
			next();

		registerMiddleware(middlewares, errorMiddlewares, standard);
		registerMiddleware(middlewares, errorMiddlewares, errHandler);
		registerMiddleware(middlewares, errorMiddlewares, "not-a-function");

		expect(middlewares).toHaveLength(1);
		expect(middlewares[0]).toBe(standard);
		expect(errorMiddlewares).toHaveLength(1);
		expect(errorMiddlewares[0]).toBe(errHandler);
	});
});

describe("Services: serverManager", () => {
	it("should create SubatomServer if undefined, or reuse current instance", () => {
		const router = {} as Router;
		const middlewares: MiddlewareHandler[] = [];
		const errorMiddlewares: ErrorMiddlewareHandler[] = [];
		const config = { port: 3000 };

		const server1 = ensureServerInstance(
			undefined,
			router,
			middlewares,
			errorMiddlewares,
			config,
		);
		expect(server1).toBeDefined();

		const server2 = ensureServerInstance(
			server1,
			router,
			middlewares,
			errorMiddlewares,
			config,
		);
		expect(server2).toBe(server1);
	});

	it("should perform graceful shutdown and exit process", () => {
		const exitSpy = vi
			.spyOn(process, "exit")
			.mockImplementation((() => undefined) as never);
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

		performGracefulShutdown(undefined, 0);
		expect(exitSpy).toHaveBeenCalledWith(0);

		const fakeServer = {
			close: vi.fn((cb: () => void) => cb()),
		} as unknown as SubatomServer;

		performGracefulShutdown(fakeServer, 1);
		expect(fakeServer.close).toHaveBeenCalled();
		expect(exitSpy).toHaveBeenCalledWith(1);

		exitSpy.mockRestore();
		logSpy.mockRestore();
	});
});

describe("Services: groupDispatcher", () => {
	it("should merge router if router instance is provided", async () => {
		const app = {} as Subatom;
		const router = {} as Router;
		const subRouter = { _isRouter: true } as unknown as IRouter;
		const merger = await import(
			"../../../../../packages/core/router/services/routerMerger.service.js"
		);

		const result = dispatchGroup(app, router, "/v1", subRouter);
		expect(result).toBe(app);
		expect(merger.mergeSubRouter).toHaveBeenCalledWith(
			router,
			"/v1",
			subRouter,
		);
	});

	it("should throw if router argument is invalid", () => {
		const app = {} as Subatom;
		const router = {} as Router;
		expect(() => dispatchGroup(app, router, "/v1", {} as IRouter)).toThrow(
			TypeError,
		);
	});

	it("should throw if prefix is not a string when router is not passed", () => {
		const app = {} as Subatom;
		const router = {} as Router;
		expect(() => dispatchGroup(app, router, 123 as unknown as string)).toThrow(
			TypeError,
		);
	});

	it("should return RouteGroupBuilder if router is omitted", () => {
		const app = {} as Subatom;
		const router = {} as Router;
		const builder = dispatchGroup(app, router, "/api");
		expect(builder).toBeInstanceOf(RouteGroupBuilder);
	});
});

describe("Services: processBoundary", () => {
	let errSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		errSpy.mockRestore();
	});

	it("should register and deregister global error and signal handlers cleanly", () => {
		const serverMock = {
			tryRecoverFromOrphanedRejection: vi.fn(() => false),
		} as unknown as SubatomServer;
		const shutdownAction = vi.fn();

		const unregister = registerProcessBoundary(
			() => serverMock,
			shutdownAction,
		);

		const unhandledListeners = process.listeners("unhandledRejection");
		const currentListener = unhandledListeners[unhandledListeners.length - 1];

		currentListener(new Error("Test Rejection"), Promise.resolve());
		expect(serverMock.tryRecoverFromOrphanedRejection).toHaveBeenCalled();

		unregister();
	});

	it("should report unrecovered promise rejections and contain shutdown hook failures", () => {
		// Arrange
		const shutdownFailure = new Error("cleanup failed");
		const shutdownAction = vi.fn(() => {
			throw shutdownFailure;
		});
		const unregister = registerProcessBoundary(() => undefined, shutdownAction);
		const rejectionListener = process.listeners("unhandledRejection").at(-1);
		const exceptionListener = process.listeners("uncaughtException").at(-1);
		if (
			typeof rejectionListener !== "function" ||
			typeof exceptionListener !== "function"
		) {
			throw new Error("Expected process boundary listeners");
		}

		try {
			// Act
			rejectionListener("rejected payload", Promise.resolve());
			exceptionListener(new Error("fatal error"), "uncaughtException");

			// Assert
			expect(errSpy).toHaveBeenCalledWith("rejected payload");
			expect(shutdownAction).toHaveBeenCalledWith(1);
			expect(errSpy).toHaveBeenCalledWith(
				"[Subatom] Error during emergency shutdown: cleanup failed",
			);
		} finally {
			unregister();
		}
	});

	it("should invoke graceful shutdown for SIGINT and SIGTERM while isolating hook failures", () => {
		// Arrange
		const sigintShutdown = vi.fn();
		const unregisterSigint = registerProcessBoundary(
			() => undefined,
			sigintShutdown,
		);
		const sigintListener = process.listeners("SIGINT").at(-1);
		if (typeof sigintListener !== "function") {
			throw new Error("Expected SIGINT listener");
		}

		try {
			// Act
			sigintListener();

			// Assert
			expect(sigintShutdown).toHaveBeenCalledWith(0);
		} finally {
			unregisterSigint();
		}

		const sigtermShutdown = vi.fn(() => {
			throw new Error("signal cleanup failed");
		});
		const unregisterSigterm = registerProcessBoundary(
			() => undefined,
			sigtermShutdown,
		);
		const sigtermListener = process.listeners("SIGTERM").at(-1);
		if (typeof sigtermListener !== "function") {
			throw new Error("Expected SIGTERM listener");
		}

		try {
			// Act
			sigtermListener();

			// Assert
			expect(sigtermShutdown).toHaveBeenCalledWith(0);
			expect(errSpy).toHaveBeenCalledWith(
				"[Subatom] Error during signal shutdown: signal cleanup failed",
			);
		} finally {
			unregisterSigterm();
		}
	});

	it("should trigger shutdownAction on uncaught exceptions in production mode", async () => {
		const shutdownAction = vi.fn();
		const unregister = registerProcessBoundary(() => undefined, shutdownAction);

		const uncaughtListeners = process.listeners("uncaughtException");
		const uncaughtHandler = uncaughtListeners[uncaughtListeners.length - 1] as (
			error: Error,
			origin: NodeJS.UncaughtExceptionOrigin,
		) => void;

		uncaughtHandler(new Error("Fatal Exception"), "uncaughtException");
		expect(shutdownAction).toHaveBeenCalledWith(1);

		unregister();
	});
});
