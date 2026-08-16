import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";

// 1. Mock External and Internal Dependencies
vi.mock("../../../../../package/config/env/env.js", () => ({
  configEnv: vi.fn(),
}));

vi.mock(
  "../../../../../package/core/pipeline/modifier/services/pipelineRegistrar.service.js",
  () => ({
    registerInterceptor: vi.fn((arr, item) => arr.push(item)),
    registerSerializer: vi.fn((arr, item) => arr.push(item)),
    registerTransformer: vi.fn((arr, item) => arr.push(item)),
  }),
);

// FIXED: Using a class structure ensures `instanceof Router` evaluates to true inside the framework
vi.mock("../../../../../package/core/router/Router.js", () => {
  class Router {
    use = vi.fn();
  }
  return { Router };
});

vi.mock(
  "../../../../../package/core/router/services/routeRegistrar.service.js",
  () => ({
    registerGroupRoute: vi.fn(),
    registerPossiblyGrouped: vi.fn(),
  }),
);

vi.mock(
  "../../../../../package/core/router/services/routerMerger.service.js",
  () => ({
    mergeSubRouter: vi.fn(),
  }),
);

vi.mock(
  "../../../../../package/core/bootstrap/subatom/services/groupDispatcher.service.js",
  () => ({
    dispatchGroup: vi.fn(),
  }),
);

vi.mock(
  "../../../../../package/core/bootstrap/subatom/services/middlewareRegistrar.service.js",
  () => ({
    registerMiddleware: vi.fn((mws, errMws, item) => mws.push(item)),
  }),
);

vi.mock(
  "../../../../../package/core/bootstrap/subatom/services/processBoundary.service.js",
  () => ({
    registerProcessBoundary: vi.fn(),
  }),
);

vi.mock(
  "../../../../../package/core/bootstrap/subatom/services/serverManager.service.js",
  () => ({
    ensureServerInstance: vi.fn(),
    performGracefulShutdown: vi.fn(),
  }),
);

// 2. Import the Actual Target and the Mocked Entities
import { Subatom } from "../../../../../package/core/bootstrap/subatom/Subatom.js";
import { configEnv } from "../../../../../package/config/env/env.js";
import { registerProcessBoundary } from "../../../../../package/core/bootstrap/subatom/services/processBoundary.service.js";
import { Router } from "../../../../../package/core/router/Router.js";
import {
  registerPossiblyGrouped,
  registerGroupRoute,
} from "../../../../../package/core/router/services/routeRegistrar.service.js";
import { mergeSubRouter } from "../../../../../package/core/router/services/routerMerger.service.js";
import { dispatchGroup } from "../../../../../package/core/bootstrap/subatom/services/groupDispatcher.service.js";
import { registerMiddleware } from "../../../../../package/core/bootstrap/subatom/services/middlewareRegistrar.service.js";
import {
  ensureServerInstance,
  performGracefulShutdown,
} from "../../../../../package/core/bootstrap/subatom/services/serverManager.service.js";

describe("Subatom Framework App Instance", () => {
  let app: Subatom;
  let mockServerInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockServerInstance = {
      start: vi.fn().mockResolvedValue(true),
      listen: vi.fn().mockReturnValue(true),
      setConfig: vi.fn(),
      setPipelineConfig: vi.fn(),
    };

    (ensureServerInstance as Mock).mockReturnValue(mockServerInstance);
    app = new Subatom();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Initialization & Process Boundary", () => {
    it("should initialize environment variables with provided options", () => {
      const envOptions = { path: ".env.custom" };
      new Subatom(envOptions as any);
      expect(configEnv).toHaveBeenCalledWith(envOptions);
    });

    it("should register process boundaries for graceful shutdown", () => {
      expect(registerProcessBoundary).toHaveBeenCalledOnce();

      const [getServerCb, shutdownCb] = vi.mocked(registerProcessBoundary).mock
        .calls[0];

      expect(getServerCb()).toBeUndefined();

      const spy = vi.spyOn(app, "gracefulShutdown");
      shutdownCb(1);
      expect(spy).toHaveBeenCalledWith(1);
    });
  });

  describe("Configuration API", () => {
    it("should merge configuration options", () => {
      app.setConfig({ appName: "TestApp", port: 8080 });
      app.setConfig({ host: "localhost" });

      app.start();
      
      // FIXED: The first argument is the uninitialized serverInstance (undefined) on first start
      expect(ensureServerInstance).toHaveBeenCalledWith(
        undefined,
        expect.any(Object),
        expect.any(Array),
        expect.any(Array),
        { appName: "TestApp", port: 8080, host: "localhost" },
        expect.any(Array),
      );
    });

    it("should forward setConfig to server instance if it is already running", async () => {
      await app.start();
      app.setConfig({ port: 9000 });
      expect(mockServerInstance.setConfig).toHaveBeenCalledWith(
        expect.objectContaining({ port: 9000 }),
      );
    });

    it("should register websocket routes and warn if registered after startup", async () => {
      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      const handler = { open: vi.fn() };

      app.ws("/chat", handler as any);
      await app.start();

      expect(consoleWarnSpy).not.toHaveBeenCalled();
      expect(ensureServerInstance).toHaveBeenCalledWith(
        undefined, // Initial instance is undefined
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        [{ path: "/chat", handlers: handler }],
      );

      app.ws("/notifications", handler as any);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("registered after start()"),
      );
    });
  });

  describe("Middleware & Router Orchestration (use)", () => {
    it("should register global middleware via registerMiddleware service", () => {
      const mw = vi.fn();
      app.use(mw);
      expect(registerMiddleware).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Array),
        mw,
      );
    });

    it("should mount a sub-router using mergeSubRouter", () => {
      const subRouter = new Router();
      app.use("/api", subRouter);
      expect(mergeSubRouter).toHaveBeenCalledWith(
        expect.any(Object),
        "/api",
        subRouter,
      );
    });

    it("should mount a path-scoped middleware directly onto the main router", () => {
      const mw = vi.fn();
      app.use("/api", mw);

      app.start();
      const internalRouter = vi.mocked(ensureServerInstance).mock.calls[0][1];
      expect(internalRouter.use).toHaveBeenCalledWith("/api", mw);
    });

    it("should throw TypeError if the first argument is neither a string nor a function", () => {
      expect(() => app.use(123 as any)).toThrowError(TypeError);
    });

    it("should throw TypeError if a path is provided but no handlers/routers are passed", () => {
      expect(() => app.use("/api")).toThrowError(TypeError);
    });

    it("should throw TypeError if an invalid handler type is passed after the path", () => {
      expect(() => app.use("/api", {} as any)).toThrowError(TypeError);
    });

    it("should register an error middleware", () => {
      const errMw = vi.fn();
      app.useError(errMw);

      app.start();
      const errorMiddlewaresList =
        vi.mocked(ensureServerInstance).mock.calls[0][3];
      expect(errorMiddlewaresList).toContain(errMw);
    });
  });

  describe("Pipeline Composition", () => {
    it("should register and export transformers, interceptors, and serializers", () => {
      const transformer = { transform: vi.fn() };
      const interceptor = { intercept: vi.fn() };
      const serializer = { serialize: vi.fn() };

      app.transformer(transformer as any);
      app.intercept(interceptor as any);
      app.serializer(serializer as any);

      const pipelineConfig = app._getPipelineConfig();

      expect(pipelineConfig.transformers).toContain(transformer);
      expect(pipelineConfig.interceptors).toContain(interceptor);
      expect(pipelineConfig.serializers).toContain(serializer);
    });
  });

  describe("HTTP Routing Integrations", () => {
    it("should register GET, POST, PUT, PATCH, DELETE properly", () => {
      const handler = vi.fn();

      app.get("/get", handler);
      expect(registerPossiblyGrouped).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
        "GET",
        "/get",
        [handler],
      );

      app.post("/post", handler);
      expect(registerPossiblyGrouped).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
        "POST",
        "/post",
        [handler],
      );

      app.put("/put", handler);
      expect(registerPossiblyGrouped).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
        "PUT",
        "/put",
        [handler],
      );

      app.patch("/patch", handler);
      expect(registerPossiblyGrouped).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
        "PATCH",
        "/patch",
        [handler],
      );

      app.delete("/delete", handler);
      expect(registerPossiblyGrouped).toHaveBeenCalledWith(
        expect.any(Object),
        undefined,
        "DELETE",
        "/delete",
        [handler],
      );
    });

    it("should dispatch group calls to groupDispatcher", () => {
      app.group("/v1");
      expect(dispatchGroup).toHaveBeenCalledWith(
        app,
        expect.any(Object),
        "/v1",
        undefined,
      );
    });
  });

  describe("Internal Group Context Management", () => {
    it("should manage group context stack correctly", () => {
      const context1 = { prefix: "/api", middlewares: [] };
      const context2 = { prefix: "/v1", middlewares: [] };

      expect(app._currentGroupContext()).toBeUndefined();

      app._pushGroupContext(context1 as any);
      expect(app._currentGroupContext()).toBe(context1);

      app._pushGroupContext(context2 as any);
      expect(app._currentGroupContext()).toBe(context2);

      app._popGroupContext();
      expect(app._currentGroupContext()).toBe(context1);
    });

    it("should register an explicit group route", () => {
      const handler = vi.fn();
      const meta = {};
      app._registerGroupRoute("GET", "/test", [handler], meta);
      expect(registerGroupRoute).toHaveBeenCalledWith(
        expect.any(Object),
        "GET",
        "/test",
        [handler],
        meta,
      );
    });
  });

  describe("Server Lifecycle Actions", () => {
    it("should orchestrate server start and inject pipeline config", async () => {
      const overrides = { port: 3000 };
      await app.start(overrides);

      expect(ensureServerInstance).toHaveBeenCalled();
      expect(mockServerInstance.setPipelineConfig).toHaveBeenCalledWith(
        app._getPipelineConfig(),
      );
      expect(mockServerInstance.start).toHaveBeenCalledWith(overrides);
    });

    it("should orchestrate server listen with parameters", () => {
      app.listen(9090, "0.0.0.0", "ProductionApp");

      expect(ensureServerInstance).toHaveBeenCalled();
      expect(mockServerInstance.setPipelineConfig).toHaveBeenCalledWith(
        app._getPipelineConfig(),
      );
      expect(mockServerInstance.listen).toHaveBeenCalledWith(
        9090,
        "0.0.0.0",
        "ProductionApp",
      );
    });

    it("should pass gracefulShutdown to the manager service", () => {
      app.gracefulShutdown(0);
      expect(performGracefulShutdown).toHaveBeenCalledWith(undefined, 0);

      app.start();
      app.gracefulShutdown(1);
      expect(performGracefulShutdown).toHaveBeenCalledWith(
        mockServerInstance,
        1,
      );
    });
  });
});