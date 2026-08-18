import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Subatom } from "../../../package/core/bootstrap/subatom/Subatom.js";
import { Router } from "../../../package/core/router/Router.js";
import * as envConfig from "../../../package/config/env/env.js";
import * as processBoundaryService from "../../../package/core/bootstrap/subatom/services/processBoundary.service.js";
import * as serverManagerService from "../../../package/core/bootstrap/subatom/services/serverManager.service.js";
import * as routeRegistrar from "../../../package/core/router/services/routeRegistrar.service.js";
import * as routerMerger from "../../../package/core/router/services/routerMerger.service.js";
import * as pipelineRegistrar from "../../../package/core/pipeline/modifier/services/pipelineRegistrar.service.js";

vi.mock("../../../package/config/env/env.js", () => ({
  configEnv: vi.fn(),
  env: { isProd: false },
}));

vi.mock(
  "../../../package/core/bootstrap/subatom/services/processBoundary.service.js",
  () => ({
    registerProcessBoundary: vi.fn(() => vi.fn()),
  }),
);

vi.mock(
  "../../../package/core/bootstrap/subatom/services/serverManager.service.js",
  () => ({
    ensureServerInstance: vi.fn(),
    performGracefulShutdown: vi.fn(),
  }),
);

vi.mock(
  "../../../package/core/router/services/routeRegistrar.service.js",
  () => ({
    registerPossiblyGrouped: vi.fn(),
    registerGroupRoute: vi.fn(),
  }),
);

vi.mock(
  "../../../package/core/router/services/routerMerger.service.js",
  () => ({
    mergeRouter: vi.fn(),
    mergeSubRouter: vi.fn(),
  }),
);

vi.mock(
  "../../../package/core/pipeline/modifier/services/pipelineRegistrar.service.js",
  () => ({
    registerTransformer: vi.fn(),
    registerInterceptor: vi.fn(),
    registerSerializer: vi.fn(),
  }),
);

describe("Unit: Subatom Core Class", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Constructor & Initialization", () => {
    it("should initialize envConfig and register process boundary on instantiating Subatom", () => {
      const app = new Subatom({ path: ".env.test" });

      expect(envConfig.configEnv).toHaveBeenCalledWith({ path: ".env.test" });
      expect(
        processBoundaryService.registerProcessBoundary,
      ).toHaveBeenCalledTimes(1);
      expect(app).toBeInstanceOf(Subatom);
    });
  });

  describe("HTTP Method Shortcuts", () => {
    it.each([
      ["get", "GET"],
      ["post", "POST"],
      ["put", "PUT"],
      ["patch", "PATCH"],
      ["delete", "DELETE"],
    ] as const)(
      "should register %s method route correctly",
      (methodName, httpMethod) => {
        const app = new Subatom();
        const handler = vi.fn();

        const result = app[methodName]("/resource", handler);

        expect(result).toBe(app);
        expect(routeRegistrar.registerPossiblyGrouped).toHaveBeenCalledWith(
          expect.any(Router),
          undefined,
          httpMethod,
          "/resource",
          [handler],
        );
      },
    );
  });

  describe("Middleware & Routing Integration (app.use)", () => {
    it("should register top-level middleware function", () => {
      const app = new Subatom();
      const middleware = (_req: any, _res: any, _next: any) => {};

      const result = app.use(middleware);

      expect(result).toBe(app);
    });

    it("should merge SubRouter when path and Router instance are passed to app.use", () => {
      const app = new Subatom();
      const subRouter = new Router();

      const result = app.use("/api", subRouter);

      expect(result).toBe(app);
      expect(routerMerger.mergeSubRouter).toHaveBeenCalledWith(
        expect.any(Router),
        "/api",
        subRouter,
      );
    });

    it("should delegate to router.use when path and middleware function are passed", () => {
      const app = new Subatom();
      const middleware = vi.fn();
      const routerSpy = vi.spyOn((app as any).router, "use");

      app.use("/api", middleware);

      expect(routerSpy).toHaveBeenCalledWith("/api", middleware);
    });

    it("should throw TypeError when first argument is neither a string nor a function", () => {
      const app = new Subatom();
      expect(() => {
        app.use(123 as any);
      }).toThrow(TypeError);
    });

    it("should throw TypeError when path prefix provided without any handlers", () => {
      const app = new Subatom();
      expect(() => {
        app.use("/empty");
      }).toThrow(TypeError);
    });

    it("should throw TypeError when an argument after prefix is invalid", () => {
      const app = new Subatom();
      expect(() => {
        app.use("/invalid", {} as any);
      }).toThrow(TypeError);
    });
  });

  describe("Pipeline Registration", () => {
    it("should register transformer", () => {
      const app = new Subatom();
      const transformer = { transform: vi.fn() } as any;

      const result = app.transformer(transformer);

      expect(result).toBe(app);
      expect(pipelineRegistrar.registerTransformer).toHaveBeenCalledWith(
        expect.any(Array),
        transformer,
      );
    });

    it("should register interceptor", () => {
      const app = new Subatom();
      const interceptor = { intercept: vi.fn() } as any;

      const result = app.intercept(interceptor);

      expect(result).toBe(app);
      expect(pipelineRegistrar.registerInterceptor).toHaveBeenCalledWith(
        expect.any(Array),
        interceptor,
      );
    });

    it("should register serializer", () => {
      const app = new Subatom();
      const serializer = { serialize: vi.fn() } as any;

      const result = app.serializer(serializer);

      expect(result).toBe(app);
      expect(pipelineRegistrar.registerSerializer).toHaveBeenCalledWith(
        expect.any(Array),
        serializer,
      );
    });
  });

  describe("WebSocket Registration", () => {
    it("should register WS routes and warn if registered after server starts", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const app = new Subatom();
      const wsHandlers = { onMessage: vi.fn() } as any;

      app.ws("/ws/chat", wsHandlers);
      expect((app as any).wsRoutes).toEqual([
        { path: "/ws/chat", handlers: wsHandlers },
      ]);
      expect(warnSpy).not.toHaveBeenCalled();

      (app as any).serverInstance = {};
      app.ws("/ws/feed", wsHandlers);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '[Subatom WS] Route "/ws/feed" registered after start()',
        ),
      );
    });
  });

  describe("Lifecycle & Server Execution", () => {
    it("should start server, configure pipeline and pass overrides", async () => {
      const app = new Subatom();
      const mockServer = {
        setPipelineConfig: vi.fn(),
        start: vi.fn().mockResolvedValue("STARTED"),
      };
      vi.mocked(serverManagerService.ensureServerInstance).mockReturnValue(
        mockServer as any,
      );

      const result = await app.start({ port: 9000 });

      expect(serverManagerService.ensureServerInstance).toHaveBeenCalled();
      expect(mockServer.setPipelineConfig).toHaveBeenCalledWith({
        transformers: [],
        interceptors: [],
        serializers: [],
      });
      expect(mockServer.start).toHaveBeenCalledWith({ port: 9000 });
      expect(result).toBe("STARTED");
    });

    it("should listen on specified port, host and appName", () => {
      const app = new Subatom();
      const mockServer = {
        setPipelineConfig: vi.fn(),
        listen: vi.fn().mockReturnValue("LISTENING"),
      };
      vi.mocked(serverManagerService.ensureServerInstance).mockReturnValue(
        mockServer as any,
      );

      const result = app.listen(3000, "0.0.0.0", "MainApp");

      expect(serverManagerService.ensureServerInstance).toHaveBeenCalled();
      expect(mockServer.listen).toHaveBeenCalledWith(
        3000,
        "0.0.0.0",
        "MainApp",
      );
      expect(result).toBe("LISTENING");
    });

    it("should unregister process boundary and invoke graceful shutdown", () => {
      const app = new Subatom();
      const unregMock = vi.fn();
      (app as any).unregisterProcessBoundary = unregMock;

      app.gracefulShutdown(0);

      expect(unregMock).toHaveBeenCalled();
      expect(serverManagerService.performGracefulShutdown).toHaveBeenCalledWith(
        undefined,
        0,
      );
    });
  });

  describe("Group Context Stack Internals", () => {
    it("should manage group contexts in stack", () => {
      const app = new Subatom();
      expect(app._currentGroupContext()).toBeUndefined();

      const ctx1 = { prefix: "/api" } as any;
      const ctx2 = { prefix: "/v1" } as any;

      app._pushGroupContext(ctx1);
      expect(app._currentGroupContext()).toBe(ctx1);

      app._pushGroupContext(ctx2);
      expect(app._currentGroupContext()).toBe(ctx2);

      app._popGroupContext();
      expect(app._currentGroupContext()).toBe(ctx1);

      app._popGroupContext();
      expect(app._currentGroupContext()).toBeUndefined();
    });

    it("should register group routes via _registerGroupRoute", () => {
      const app = new Subatom();
      const handlers = [vi.fn()];
      const meta = { auth: true };

      app._registerGroupRoute("GET", "/test", handlers, meta as any);

      expect(routeRegistrar.registerGroupRoute).toHaveBeenCalledWith(
        (app as any).router,
        "GET",
        "/test",
        handlers,
        meta,
      );
    });
  });
});
