/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	IInterceptor,
	ISerializer,
	ITransformer,
} from "../../../../packages/pipelines/pipeline.types.js";
import type {
	IHandler,
	IRouter,
} from "../../../../packages/core/router/types/router.types.js";
import { Subatom } from "../../../../packages/core/subatom/Subatom.js";
import * as processBoundaryService from "../../../../packages/core/subatom/services/processBoundary.service.js";

vi.mock("../../../../packages/core/subatom/config/env/env.js", () => ({
	configEnv: vi.fn(),
	env: { isProd: false },
}));

vi.mock("../../../../packages/core/server/SubatomServer.js", () => {
	return {
		SubatomServer: class {
			public setConfig = vi.fn();
			public setPipelineConfig = vi.fn();
			public start = vi.fn(async () => ({ status: "started" }));
			public listen = vi.fn((port: number) => ({ port }));
			public close = vi.fn((cb: () => void) => cb());
			public tryRecoverFromOrphanedRejection = vi.fn(() => false);
		},
	};
});

vi.mock("../../../../packages/core/router/Router.js", () => {
	return {
		Router: class {
			public use = vi.fn();
			public group = vi.fn();
			public resource = vi.fn();
			public getRoutes = vi.fn(() => []);
		},
	};
});

vi.mock(
	"../../../../packages/core/router/services/routeRegistrar.service.js",
	() => ({
		registerPossiblyGrouped: vi.fn(),
		registerGroupRoute: vi.fn(),
	}),
);

vi.mock(
	"../../../../packages/core/router/services/routerMerger.service.js",
	() => ({
		mergeSubRouter: vi.fn(),
	}),
);

vi.mock("../../../../packages/core/router/helpers/isRouterInstance.js", () => ({
	default: (val: unknown): boolean =>
		Boolean(val && typeof val === "object" && "_isRouter" in val),
}));
describe("Subatom Application Class", () => {
	let app: Subatom;
	let exitSpy: ReturnType<typeof vi.spyOn>;
	let logSpy: ReturnType<typeof vi.spyOn>;
	let errSpy: ReturnType<typeof vi.spyOn>; // 1. Add error spy variable

	beforeEach(() => {
		exitSpy = vi
			.spyOn(process, "exit")
			.mockImplementation((() => undefined) as never);
		logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		errSpy = vi.spyOn(console, "error").mockImplementation(() => {}); // 2. Mock console.error
		app = new Subatom();
	});

	afterEach(() => {
		app.gracefulShutdown(0);
		exitSpy.mockRestore();
		logSpy.mockRestore();
		errSpy.mockRestore(); // 3. Restore console.error
		vi.restoreAllMocks();
	});

	// ... rest of your tests

	it("should configure custom settings and sync to active server", () => {
		app.setConfig({ port: 8000 });
		expect(app).toBeInstanceOf(Subatom);
	});

	it("should synchronize configuration to an already initialized server", () => {
		// Arrange
		const setConfig = vi.fn();
		const internalApp = app as unknown as {
			serverInstance: {
				setConfig: (config: { port: number }) => void;
				close: (callback: () => void) => void;
			};
		};
		internalApp.serverInstance = {
			setConfig,
			close: (callback) => callback(),
		};

		// Act
		app.setConfig({ port: 8081 });

		// Assert
		expect(setConfig).toHaveBeenCalledWith({ port: 8081 });
	});

	it("should register pipelines: transformer, interceptor, serializer", () => {
		const transformer: ITransformer = {
			beforeRequest: vi.fn(),
		};
		const interceptor: IInterceptor = { intercept: vi.fn() };
		const serializer: ISerializer = { serialize: vi.fn() };

		app.transformer(transformer).intercept(interceptor).serializer(serializer);

		const pipelineConfig = app._getPipelineConfig();
		expect(pipelineConfig.transformers).toContain(transformer);
		expect(pipelineConfig.interceptors).toContain(interceptor);
		expect(pipelineConfig.serializers).toContain(serializer);
	});

	it("should handle app.use validation and registration paths", () => {
		const mw = vi.fn();
		app.use(mw);

		const subRouter = { _isRouter: true } as unknown as IRouter;
		app.use("/api", mw, subRouter);

		expect(() => app.use(123 as unknown as string)).toThrow(TypeError);
		expect(() => app.use("/empty")).toThrow(TypeError);
		expect(() => app.use("/bad", {} as unknown as IRouter)).toThrow(TypeError);
	});

	it("should register error middlewares via useError()", () => {
		const errMw = vi.fn();
		expect(app.useError(errMw)).toBe(app);
	});

	it("should dispatch router groups and register internal grouped routes", async () => {
		// Arrange
		const router = { _isRouter: true } as unknown as IRouter;
		const registrar = await import(
			"../../../../packages/core/router/services/routeRegistrar.service.js"
		);
		const handler: IHandler = vi.fn();

		// Act
		app.group("/api", router);
		app._registerGroupRoute("GET", "/api/items", [handler], { name: "items" });

		// Assert
		expect(registrar.registerGroupRoute).toHaveBeenCalledWith(
			expect.anything(),
			"GET",
			"/api/items",
			[handler],
			{ name: "items" },
		);
	});

	it("should delegate configured and builder-style groups", () => {
		// Arrange
		const internalApp = app as unknown as {
			router: { group: (prefix: string, options: { tags: string[] }) => void };
		};
		const group = vi.spyOn(internalApp.router, "group");

		// Act
		const configuredResult = app.group("/api", { tags: ["api"] });
		const builderResult = app.group();

		// Assert
		expect(configuredResult).toBe(app);
		expect(group).toHaveBeenCalledWith("/api", { tags: ["api"] });
		expect(builderResult).toBeDefined();
	});

	it("should delegate resource routing to the internal router", () => {
		const controller = {};
		expect(app.resource("/users", controller)).toBe(app);
	});

	it("should register HTTP verbs via registerPossiblyGrouped", async () => {
		const registrar = await import(
			"../../../../packages/core/router/services/routeRegistrar.service.js"
		);
		const handler: IHandler = vi.fn();

		app.get("/items", handler);
		app.post("/items", handler);
		app.put("/items", handler);
		app.patch("/items", handler);
		app.delete("/items", handler);

		expect(registrar.registerPossiblyGrouped).toHaveBeenCalledWith(
			expect.anything(),
			undefined,
			"GET",
			"/items",
			[handler],
		);
		expect(registrar.registerPossiblyGrouped).toHaveBeenCalledWith(
			expect.anything(),
			undefined,
			"POST",
			"/items",
			[handler],
		);
		expect(registrar.registerPossiblyGrouped).toHaveBeenCalledWith(
			expect.anything(),
			undefined,
			"PUT",
			"/items",
			[handler],
		);
		expect(registrar.registerPossiblyGrouped).toHaveBeenCalledWith(
			expect.anything(),
			undefined,
			"PATCH",
			"/items",
			[handler],
		);
		expect(registrar.registerPossiblyGrouped).toHaveBeenCalledWith(
			expect.anything(),
			undefined,
			"DELETE",
			"/items",
			[handler],
		);
	});

	it("should boot server on listen() and start()", async () => {
		const listenRes = app.listen(9000, "127.0.0.1", "TestApp");
		expect(listenRes).toEqual({ port: 9000 });

		const startRes = await app.start({ port: 9001 });
		expect(startRes).toEqual({ status: "started" });
	});

	it("should delegate an explicit listen port with a callback-shaped argument", () => {
		const callback = vi.fn();
		const listen = app.listen as unknown as (
			port: number,
			host?: unknown,
		) => unknown;

		expect(listen.call(app, 3000, callback)).toEqual({ port: 3000 });
	});

	it("should delegate an options-shaped listen argument", () => {
		const options = { port: 4000 };
		const listen = app.listen as unknown as (
			options: unknown,
			callback?: unknown,
		) => unknown;
		const callback = vi.fn();

		expect(listen.call(app, options, callback)).toEqual({ port: options });
	});

	it("should use the default listen port when called without arguments", () => {
		expect(app.listen()).toEqual({ port: 8080 });
	});

	it("should expose the server getter and shutdown callback through process boundaries", () => {
		const rejectionListener = process.listeners("unhandledRejection").at(-1);
		const signalListener = process.listeners("SIGTERM").at(-1);

		if (
			typeof rejectionListener !== "function" ||
			typeof signalListener !== "function"
		) {
			throw new Error("Expected Subatom process-boundary listeners");
		}

		rejectionListener(new Error("inspect server getter"), Promise.resolve());
		signalListener("SIGTERM");

		expect(exitSpy).toHaveBeenCalledWith(0);
	});

	it("should tolerate missing process-boundary unregister callbacks", () => {
		const registerSpy = vi
			.spyOn(processBoundaryService, "registerProcessBoundary")
			.mockReturnValueOnce(undefined as unknown as () => void);
		const unregisteredApp = new Subatom();
		const internalApp = unregisteredApp as unknown as {
			unregisterProcessBoundary?: () => void;
		};

		internalApp.unregisterProcessBoundary = undefined;
		unregisteredApp.gracefulShutdown(0);

		expect(registerSpy).toHaveBeenCalled();
		registerSpy.mockRestore();
	});

	it("should propagate server initialization failures from start()", async () => {
		// Arrange
		const failingServer = {
			setConfig: vi.fn(),
			setPipelineConfig: vi.fn(),
			start: vi.fn(async () => {
				throw new Error("port unavailable");
			}),
			listen: vi.fn(),
			close: vi.fn((callback: () => void) => callback()),
			tryRecoverFromOrphanedRejection: vi.fn(() => false),
		};
		const internalApp = app as unknown as {
			serverInstance: typeof failingServer;
		};
		internalApp.serverInstance = failingServer;

		// Act
		const startAttempt = app.start();

		// Assert
		await expect(startAttempt).rejects.toThrow("port unavailable");
		expect(failingServer.setPipelineConfig).toHaveBeenCalledOnce();
	});

	it("should delegate getRoutes() to internal router", () => {
		const routes = app.getRoutes();
		expect(Array.isArray(routes)).toBe(true);
	});

	it("should maintain group context stack across push and pop", () => {
		expect(app._currentGroupContext()).toBeUndefined();
		const ctx = {
			prefix: "/api",
			middlewares: [],
			tags: [],
			rateLimitSpec: undefined,
			rateLimitMiddleware: undefined,
		};
		app._pushGroupContext(ctx);
		expect(app._currentGroupContext()).toBe(ctx);
		app._popGroupContext();
		expect(app._currentGroupContext()).toBeUndefined();
	});
});
