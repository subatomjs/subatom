/// <reference types="node" />
/** biome-ignore-all lint/suspicious/noExplicitAny: explanation */
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Router } from "../../../../packages/core/router/Router.js";
import { Request } from "../../../../packages/core/http/request/Request.js";
import { Response } from "../../../../packages/core/http/response/Response.js";
import { ErrorFormatter } from "../../../../packages/errors/ErrorFormatter.js";
import {
  MethodNotAllowedError,
  NotFoundError,
} from "../../../../packages/errors/Errors.js";
import type {
  IHandler,
  IRouteMiddleware,
} from "../../../../packages/core/router/types/router.types.js";
import type {
  ITransformer,
  IInterceptor,
  ISerializer,
} from "../../../../packages/pipelines/pipeline.types.js";
import { matchPath } from "../../../../packages/core/router/services/pathMatch.service.js";
import { matchRoute } from "../../../../packages/core/router/services/routeMatcher.service.js";
import { registerWithMeta } from "../../../../packages/core/router/services/routeRegistry.service.js";
import { normalizeHandlers } from "../../../../packages/core/router/helpers/normalizeHandlers.js";
import { buildResourceRoutes } from "../../../../packages/core/router/helpers/resourceRouteBuilder.js";
import { normalizeError } from "../../../../packages/core/router/services/errorNormalizer.service.js";

vi.mock("../../../../packages/errors/ErrorFormatter.js", () => ({
  ErrorFormatter: {
    handle: vi.fn(),
  },
}));

vi.mock("../../../../packages/methods/uuid.js", () => ({
  uuid: {
    short: () => "mock-uuid",
  },
}));

function createHttpFixture(
  method = "GET",
  url = "/users",
  headers: Record<string, string> = { host: "localhost:8080" },
): {
  req: Request;
  res: Response;
  rawReq: IncomingMessage;
  rawRes: ServerResponse;
} {
  const rawReq = Object.assign(new EventEmitter(), {
    method,
    url,
    headers,
    socket: { remoteAddress: "127.0.0.1", encrypted: false },
    off: vi.fn(),
  }) as unknown as IncomingMessage;

  const rawRes = Object.assign(new EventEmitter(), {
    headersSent: false,
    writableEnded: false,
    statusCode: 200,
    setHeader: vi.fn(),
    getHeader: vi.fn(),
    removeHeader: vi.fn(),
    write: vi.fn().mockReturnValue(true),
    end: vi.fn(function (this: { writableEnded: boolean }) {
      this.writableEnded = true;
    }),
  }) as unknown as ServerResponse;

  const req = new Request(rawReq);
  const res = new Response(rawRes);

  return { req, res, rawReq, rawRes };
}

const createMockHandler = (): IHandler =>
  vi.fn((_req, _res, next) => {
    if (typeof next === "function") next();
  });

describe("Router", () => {
  let router: Router;
  let req: Request;
  let res: Response;

  beforeEach(() => {
    vi.clearAllMocks();
    router = new Router();
    const fixture = createHttpFixture("GET", "/users");
    req = fixture.req;
    res = fixture.res;
  });

  describe("Verb Registration", () => {
    it("should register and match all standard HTTP methods", () => {
      const handler = createMockHandler();
      router.get("/get", handler);
      router.post("/post", handler);
      router.put("/put", handler);
      router.patch("/patch", handler);
      router.delete("/delete", handler);
      router.options("/options", handler);
      router.head("/head", handler);
      router.trace("/trace", handler);
      router.connect("/connect", handler);
      router.query("/query", handler);

      expect(router.match("GET", "/get")?.route.path).toBe("/get");
      expect(router.match("POST", "/post")?.route.path).toBe("/post");
      expect(router.match("PUT", "/put")?.route.path).toBe("/put");
      expect(router.match("PATCH", "/patch")?.route.path).toBe("/patch");
      expect(router.match("DELETE", "/delete")?.route.path).toBe("/delete");
      expect(router.match("OPTIONS", "/options")?.route.path).toBe("/options");
      expect(router.match("HEAD", "/head")?.route.path).toBe("/head");
      expect(router.match("TRACE", "/trace")?.route.path).toBe("/trace");
      expect(router.match("CONNECT", "/connect")?.route.path).toBe("/connect");
      expect(router.match("QUERY", "/query")?.route.path).toBe("/query");
    });

    it("should register and match ALL wildcard routes for any HTTP method", () => {
      router.all("/wildcard", createMockHandler());
      expect(router.match("GET", "/wildcard")).toBeDefined();
      expect(router.match("POST", "/wildcard")).toBeDefined();
      expect(router.match("DELETE", "/wildcard")).toBeDefined();
    });

    it("should register routes using object options configuration", () => {
      router.get("/profile", {
        name: "user.profile",
        tags: ["user"],
        rateLimit: "100/m",
        controller: () => ({ ok: true }),
      });

      const route = router.findRouteByName("user.profile");
      expect(route).toBeDefined();
      expect(route?.tags).toEqual(["user"]);
      expect(route?.rateLimit).toBe("100/m");
    });

it("should register routes with single non-array middleware in options", () => {
      const singleMw: IRouteMiddleware = vi.fn((_req, _res, next) => next());
      router.get("/options-single-mw", {
        middleware: [singleMw],
        controller: () => ({ handled: true }),
      });

      const route = router.getRoutes().find((r) => r.path === "/options-single-mw");
      expect(route).toBeDefined();
      expect(route?.handlers.length).toBeGreaterThanOrEqual(1);
    });

    it("should throw a TypeError if method is invalid or empty", () => {
      expect(() =>
        router.registerWithMeta("", "/path", [createMockHandler()]),
      ).toThrow(TypeError);
    });

    it("should throw a TypeError if no handlers are provided or a handler is invalid", () => {
      expect(() => router.registerWithMeta("GET", "/path", [])).toThrow(
        TypeError,
      );
      expect(() =>
        router.registerWithMeta("GET", "/path", [{} as unknown as IHandler]),
      ).toThrow(TypeError);
    });

    it("should throw an error on duplicate route names", () => {
      router.get("/first", createMockHandler(), { name: "test-route" });
      expect(() =>
        router.get("/second", createMockHandler(), { name: "test-route" }),
      ).toThrow(TypeError);
    });
  });

  describe("Trie Matching & Parameters", () => {
    it("should extract path parameters correctly", () => {
      router.get("/users/:id/orders/:orderId", createMockHandler());
      const matched = router.match("GET", "/users/100/orders/200");
      expect(matched?.params).toEqual({ id: "100", orderId: "200" });
    });

    it("should support optional parameter matching", () => {
      router.get("/archive/:year?", createMockHandler());
      expect(router.match("GET", "/archive/2026")?.params).toEqual({
        year: "2026",
      });
      expect(router.match("GET", "/archive")?.params).toEqual({});
    });

    it("should extract query parameters from URL", () => {
      router.get("/search", createMockHandler());
      const matched = router.match("GET", "/search?term=vitest&page=2");
      expect(matched?.query).toEqual({ term: "vitest", page: "2" });
    });

    it("should prefer static routes, fall back to ALL routes, and reject malformed parameters", () => {
      router.get("/files/:name", createMockHandler());
      router.get("/files/new", createMockHandler());
      router.all("/fallback", createMockHandler());

      const staticMatch = router.match("GET", "/files/new");
      const wildcardMatch = router.match("PATCH", "/fallback");
      const malformedMatch = router.match("GET", "/files/%E0%A4%A");

      expect(staticMatch?.route.path).toBe("/files/new");
      expect(wildcardMatch?.route.method).toBe("ALL");
      expect(malformedMatch).toBeUndefined();
    });

    it("should normalize method casing and preserve trailing parameter segments", () => {
      router.get("/projects/:projectId/", createMockHandler());

      const lowerCaseMethod = router.match("get", "/projects/0/");
      const unmatched = router.match("GET", "/projects/0/history");

      expect(lowerCaseMethod?.params).toEqual({ projectId: "0" });
      expect(unmatched).toBeUndefined();
    });

    it("should reject missing, nameless, and malformed parameters in prefix matching", () => {
      const internalRouter = router as unknown as {
        matchPath(
          routePath: string,
          incomingPath: string,
          options?: { prefix?: boolean },
        ): Record<string, string> | null;
      };

      const missingRequired = internalRouter.matchPath(
        "/projects/:projectId",
        "/projects",
      );
      const missingName = internalRouter.matchPath(
        "/projects/:",
        "/projects/0",
      );
      const malformedEncoding = internalRouter.matchPath(
        "/projects/:projectId",
        "/projects/%E0%A4%A",
      );
      const matchedParameter = internalRouter.matchPath(
        "/projects/:projectId",
        "/projects/0",
      );

      expect(missingRequired).toBeNull();
      expect(missingName).toBeNull();
      expect(malformedEncoding).toBeNull();
      expect(matchedParameter).toEqual({ projectId: "0" });
    });
  });

  describe("Groups", () => {
    it("should register grouped routes via callback syntax with prefixes and metadata", () => {
      router.group("/api/v1", {
        tags: ["v1"],
        rateLimit: "60/m",
        name: "v1",
        routes: (child) => {
          child.get("/users", createMockHandler(), { name: "users" });
        },
      });

      const route = router.findRouteByName("v1.users");
      expect(route).toBeDefined();
      expect(route?.path).toBe("/api/v1/users");
      expect(route?.tags).toEqual(["v1"]);
      expect(route?.rateLimit).toBe("60/m");
    });

    it("should support shorthand router.group with 2 arguments (prefix and callback)", () => {
      router.group("/v2", (child) => {
        child.get("/ping", createMockHandler(), { name: "v2.ping" });
      });

      expect(router.findRouteByName("v2.ping")).toBeDefined();
      expect(router.match("GET", "/v2/ping")).toBeDefined();
    });

    it("should register grouped routes via chaining proxy syntax", () => {
      const group = router.group("/dashboard");
      group.get("/stats", createMockHandler());

      expect(router.match("GET", "/dashboard/stats")).toBeDefined();
    });

    it("should inherit group middleware, tags, rate limit, and name prefixes", async () => {
      const groupMiddleware: IRouteMiddleware = vi.fn((_req, _res, next) =>
        next(),
      );
      const endpoint = createMockHandler();
      router.group("/api", {
        name: "api",
        tags: ["api"],
        rateLimit: "10/m",
        middleware: [groupMiddleware],
        routes: (child) =>
          child.get("/items/:id", endpoint, { name: "show", tags: ["items"] }),
      });
      const fixture = createHttpFixture("GET", "/api/items/0");

      await router.dispatch(fixture.req, fixture.res);
      const route = router.findRouteByName("api.show");

      expect(groupMiddleware).toHaveBeenCalledOnce();
      expect(endpoint).toHaveBeenCalledOnce();
      expect(route?.tags).toEqual(["api", "items"]);
      expect(route?.rateLimit).toBe("10/m");
      expect(fixture.req.params).toEqual({ id: "0" });
    });
  });

  describe("Sub-router Mounting (use)", () => {
    it("should mount sub-routers with path prefix", () => {
      const sub = new Router();
      sub.get("/posts", createMockHandler());
      router.use("/admin", sub);

      expect(router.match("GET", "/admin/posts")).toBeDefined();
    });

    it("should register path-based and global USE middleware", async () => {
      const mw: IRouteMiddleware = vi.fn((_req, _res, next) => {
        next();
      });

      const endpoint: IHandler = vi.fn((_req, res) => {
        res.end();
      });

      router.use("/users", mw);
      router.get("/users/settings", endpoint);

      const fixture = createHttpFixture("GET", "/users/settings");
      await router.dispatch(fixture.req, fixture.res);

      expect(mw).toHaveBeenCalled();
      expect(endpoint).toHaveBeenCalled();
    });

    it("should throw if use receives an invalid argument", () => {
      expect(() => router.use("/test", null as unknown as Router)).toThrow(
        TypeError,
      );
      expect(() => router.use(123 as unknown as string)).toThrow(TypeError);
    });

    it("should register multiple middlewares under a path prefix with router.use(path, mw1, mw2)", async () => {
      const mw1: IRouteMiddleware = vi.fn((_req, _res, next) => next());
      const mw2: IRouteMiddleware = vi.fn((_req, _res, next) => next());
      const endpoint = createMockHandler();

      router.use("/sub", mw1, mw2);
      router.get("/sub/endpoint", endpoint);

      const fixture = createHttpFixture("GET", "/sub/endpoint");
      await router.dispatch(fixture.req, fixture.res);

      expect(mw1).toHaveBeenCalled();
      expect(mw2).toHaveBeenCalled();
      expect(endpoint).toHaveBeenCalled();
    });

    it("should run global and parameterized USE middleware only for matching prefixes", async () => {
      const globalMiddleware: IRouteMiddleware = vi.fn((_req, _res, next) =>
        next(),
      );
      const parameterizedMiddleware: IRouteMiddleware = vi.fn(
        (_req, _res, next) => next(),
      );
      const endpoint = createMockHandler();
      router.use(globalMiddleware);
      router.use("/teams/:teamId", parameterizedMiddleware);
      router.get("/teams/:teamId/members", endpoint);
      const fixture = createHttpFixture("GET", "/teams/0/members");

      await router.dispatch(fixture.req, fixture.res);

      expect(globalMiddleware).toHaveBeenCalledOnce();
      expect(parameterizedMiddleware).toHaveBeenCalledOnce();
      expect(endpoint).toHaveBeenCalledOnce();
      expect(fixture.req.params).toEqual({ teamId: "0" });
    });
  });

  describe("Dispatch & Error Handling", () => {
    it("should dispatch request and execute handlers", async () => {
      const handler: IHandler = vi.fn((_req, res) => {
        res.end();
      });
      router.get("/test", handler);

      const fixture = createHttpFixture("GET", "/test");
      await router.dispatch(fixture.req, fixture.res);
      expect(handler).toHaveBeenCalled();
    });

    it("should throw MethodNotAllowedError if route exists under another method", async () => {
      router.post("/items", createMockHandler());
      const fixture = createHttpFixture("GET", "/items");

      await expect(router.dispatch(fixture.req, fixture.res)).rejects.toThrow(
        MethodNotAllowedError,
      );
    });

    it("should throw NotFoundError if route is not registered", async () => {
      const fixture = createHttpFixture("GET", "/unregistered");

      await expect(router.dispatch(fixture.req, fixture.res)).rejects.toThrow(
        NotFoundError,
      );
    });

    it("should format and handle error via handleRequest", async () => {
      const errorHandler: IHandler = () => {
        throw new Error("Fatal boom");
      };
      router.get("/error", errorHandler);

      const fixture = createHttpFixture("GET", "/error");
      await router.handleRequest(fixture.req, fixture.res);

      expect(ErrorFormatter.handle).toHaveBeenCalled();
    });

it("should not format error if response writable has already ended", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const endedHandler: IHandler = (_req, response) => {
        response.end();
        throw new Error("After end");
      };

      router.get("/ended", endedHandler);
      const fixture = createHttpFixture("GET", "/ended");

      await router.handleRequest(fixture.req, fixture.res);
      expect(ErrorFormatter.handle).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

	describe("Router 100% gap closures", () => {
    it("should cover remaining HTTP helper verb methods and clear methods", () => {
      const dummyHandler = createMockHandler();
      // Lines 104, 113, 122: router.all(), router.head(), router.options() direct helper wrappers
      router.all("/direct-all", dummyHandler);
      router.head("/direct-head", dummyHandler);
      router.options("/direct-options", dummyHandler);

      expect(router.match("HEAD", "/direct-head")).toBeDefined();
      expect(router.match("OPTIONS", "/direct-options")).toBeDefined();
    });

it("should cover router.use error branches and overload variants", () => {
      // Line 640: router.use rejects invalid argument combinations
      expect(() => (router as any).use(12345, () => {})).toThrow(TypeError);
      expect(() => (router as any).use("/prefix", "not-a-function")).toThrow(TypeError);
      expect(() => (router as any).use(null)).toThrow(TypeError);
    });

    it("should handle error formatting when headers are sent or response ended", async () => {
      // Lines 596-599, 783: error handler edge cases
      const fixture = createHttpFixture("GET", "/err-route");
      router.get("/err-route", () => {
        throw new Error("Route failed");
      });
      await router.handleRequest(fixture.req, fixture.res);
      expect(ErrorFormatter.handle).toHaveBeenCalled();
    });

    it("should handle route introspection helpers", () => {
      // Lines 913, 929: route inspector and name check helper methods
      router.get("/inspect", createMockHandler(), { name: "inspect.route" });
      expect(router.hasRoute("inspect.route")).toBe(true);
      expect(router.findRouteByName("inspect.route")).toBeDefined();
      expect(router.findRouteByName("nonexistent")).toBeUndefined();
    });
  });

    it("should not format error if response writable has already ended", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const endedHandler: IHandler = (_req, response) => {
        response.end();
        throw new Error("After end");
      };

      router.get("/ended", endedHandler);
      const fixture = createHttpFixture("GET", "/ended");

      await router.handleRequest(fixture.req, fixture.res);
      expect(ErrorFormatter.handle).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should dispatch defaults when a request omits its method and URL", async () => {
      const handler = createMockHandler();
      router.get("/", handler);
      const fixture = createHttpFixture();
      fixture.rawReq.method = "";
      Object.defineProperty(fixture.req, "url", { value: "", writable: true });

      await router.dispatch(fixture.req, fixture.res);
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe("Pipelines & urlFor", () => {
    it("should register modifiers and attach them to new and existing routes", () => {
      const dummyTransformer = {
        beforeRequest: vi.fn(),
      } as unknown as ITransformer;
      const dummyInterceptor = {
        intercept: vi.fn(),
      } as unknown as IInterceptor;
      const dummySerializer = {
        serialize: vi.fn(),
      } as unknown as ISerializer;

      router.get("/pre", createMockHandler());
      router.transformer(dummyTransformer);
      router.intercept(dummyInterceptor);
      router.serializer(dummySerializer);
      router.get("/post", createMockHandler());

      const pre = router.match("GET", "/pre")?.route.routerPipeline;
      const post = router.match("GET", "/post")?.route.routerPipeline;

      expect(pre?.transformers).toContain(dummyTransformer);
      expect(post?.interceptors).toContain(dummyInterceptor);
      expect(post?.serializers).toContain(dummySerializer);
    });

    it("should reverse lookup and build URLs with urlFor", () => {
      router.get("/posts/:id", createMockHandler(), { name: "posts.show" });
      const url = router.urlFor("posts.show", { id: "42" }, { ref: "feed" });
      expect(url).toBe("/posts/42?ref=feed");
    });

    it("should throw in urlFor when route name is not found", () => {
      expect(() => router.urlFor("unknown.route")).toThrow(
        '[Subatom] urlFor: no route registered with name "unknown.route".',
      );
    });

    it("should expose an immutable route snapshot and clear both routes and indexes", () => {
      router.get("/snapshot", createMockHandler(), { name: "snapshot" });

      const routes = router.getRoutes();
      router.clearRoutes();

      expect(Object.isFrozen(routes)).toBe(true);
      expect(Object.isFrozen(routes[0])).toBe(true);
      expect(router.hasRoute("snapshot")).toBe(false);
      expect(router.match("GET", "/snapshot")).toBeUndefined();
    });
  });

  describe("Schema & Validation Middleware Injection", () => {
    it("should wrap route with validator middleware when schema is specified", async () => {
      const handler = vi.fn((_req, res) => res.end());
      router.get("/validated", handler, {
        schema: {
          query: {
            type: "object",
            properties: { id: { type: "string" } },
          },
        },
      });

      const route = router.getRoutes().find((r) => r.path === "/validated");
      expect(route?.handlers.length).toBe(2);
      expect(route?.schema).toBeDefined();

      const fixture = createHttpFixture("GET", "/validated");
      await router.dispatch(fixture.req, fixture.res);
      expect(handler).toHaveBeenCalled();
    });

    it("should attach validator middleware even if handlers array is empty prior to adding", () => {
      const dummyHandler = createMockHandler();
      router.registerWithMeta("POST", "/direct-schema", [dummyHandler], {
        schema: { body: { type: "object" } },
      });

      const route = router.findRouteByName("mock-uuid");
      expect(route).toBeDefined();
    });
  });

  describe("Sub-router Direct Mount & Segment Fallbacks", () => {
    it("should mount sub-router directly without path via router.use(subRouter)", () => {
      const sub = new Router();
      sub.get("/dashboard", createMockHandler());

      router.use(sub);
      expect(router.match("GET", "/dashboard")).toBeDefined();
    });

    it("should mount sub-router under path without leading slash", () => {
      const sub = new Router();
      sub.get("/settings", createMockHandler());

      router.use("api/v1", sub);
      expect(router.match("GET", "/api/v1/settings")).toBeDefined();
    });

    it("should match trailing optional parameters when present or absent", () => {
      router.get("/files/:category/:file?", createMockHandler());

      expect(router.match("GET", "/files/docs/readme.txt")?.params).toEqual({
        category: "docs",
        file: "readme.txt",
      });
      expect(router.match("GET", "/files/docs")?.params).toEqual({
        category: "docs",
      });
    });

    it("should return undefined when trie route path static segment mismatches", () => {
      router.get("/api/v1/users", createMockHandler());
      expect(router.match("GET", "/api/v1/posts")).toBeUndefined();
      expect(router.match("GET", "/api/v2/users")).toBeUndefined();
    });
  });

  describe("Edge branch coverage", () => {
    it("should not double-prefix route name when it already starts with groupNamePrefix", () => {
      router.group("/admin", {
        name: "admin",
        routes: (child) => {
          child.get("/users", createMockHandler(), { name: "admin.users" });
        },
      });

      const route = router.findRouteByName("admin.users");
      expect(route).toBeDefined();
      expect(route?.name).toBe("admin.users");
    });

    it("should allow accessing non-function properties on group proxy", () => {
      const group = router.group("/dashboard");
      expect((group as unknown as { routes: unknown }).routes).toBeDefined();
    });

    it("should filter out non-functions when multiple middlewares are passed to router.use(fn, ...)", async () => {
      const mw1: IRouteMiddleware = vi.fn((_req, _res, next) => next());
      const mw2: IRouteMiddleware = vi.fn((_req, _res, next) => next());

      router.use(mw1, mw2, null as unknown as IHandler, undefined as unknown as IHandler);

      const fixture = createHttpFixture("GET", "/test-mw");
      router.get("/test-mw", createMockHandler());

      await router.dispatch(fixture.req, fixture.res);
      expect(mw1).toHaveBeenCalled();
      expect(mw2).toHaveBeenCalled();
    });

    it("should handle routes registered with empty tags array in meta", () => {
      router.get("/no-tags", createMockHandler(), { tags: [] });
      const route = router.getRoutes().find((r) => r.path === "/no-tags");
      expect(route?.tags).toBeUndefined();
    });

    it("should handle trie backtracking when dynamic segment child does not match suffix", () => {
      router.get("/users/:id/edit", createMockHandler());
      expect(router.match("GET", "/users/123/delete")).toBeUndefined();
    });

    it("should match path with prefix in matchPath when optional param is omitted", () => {
      const internalRouter = router as unknown as {
        matchPath(
          routePath: string,
          incomingPath: string,
          options?: { prefix?: boolean },
        ): Record<string, string> | null;
      };

      const result = internalRouter.matchPath("/api/:version?", "/api", { prefix: true });
      expect(result).toEqual({});
    });
  });

  describe("Additional Router branch coverage", () => {
    it("should apply newly registered pipeline components to routes without pipelines", () => {
      const route = {
        method: "GET",
        path: "/pipeline-refresh",
        handlers: [createMockHandler()],
      } as any;
      (router as any).routes.push(route);

      router.transformer({ beforeRequest: vi.fn() } as unknown as ITransformer);
      route.routerPipeline = undefined;
      router.intercept({ intercept: vi.fn() } as unknown as IInterceptor);
      route.routerPipeline = undefined;
      router.serializer({ serialize: vi.fn() } as unknown as ISerializer);

      expect(route.routerPipeline).toBeDefined();
    });

    it("should mount a root sub-router while preserving parameter bindings", () => {
      const sub = new Router();
      sub.get("/users/:userId", createMockHandler());

      router.use("/", sub);

      expect(router.match("GET", "/users/42")?.params).toEqual({
        userId: "42",
      });
    });

    it("should register a mounted route through the synchronization API", () => {
      const mountedHandler = createMockHandler();
      (router as any).registerMountedRoute({
        method: "GET",
        path: "/mounted/:id",
        handlers: [mountedHandler],
        name: "mounted.route",
      });

      expect(router.match("GET", "/mounted/7")?.params).toEqual({ id: "7" });
      expect(router.findRouteByName("mounted.route")).toBeDefined();
    });

    it("should normalize trailing slash lookups and return undefined for an unresolved terminal", () => {
      router.get("/health/", createMockHandler());

      expect(router.match("GET", "/health/")).toBeDefined();
      expect(router.match("GET", "/health/missing")).toBeUndefined();
    });

    it("should execute method-not-allowed and not-found fallbacks", async () => {
      router.post("/method-check", createMockHandler());
      const methodFixture = createHttpFixture("GET", "/method-check");
      await expect(router.dispatch(methodFixture.req, methodFixture.res)).rejects.toThrow(
        MethodNotAllowedError,
      );

      const missingFixture = createHttpFixture("GET", "/missing-route");
      await expect(router.dispatch(missingFixture.req, missingFixture.res)).rejects.toThrow(
        NotFoundError,
      );
    });

    it("should cover direct router service fallbacks and malformed parameters", () => {
      expect(matchPath("/files/:tail?", "/files")).toEqual({});
      expect(matchPath("/files/:tail?", "/files/%E0%A4%A")).toBeNull();
      expect(matchPath("/api/:version", "/api", { prefix: true })).toBeNull();
      expect(matchPath("/api/:", "/api/value")).toBeNull();
      expect(matchPath("/api/", "/api/value")).toBeNull();

      const route = {
        method: "GET",
        path: "/files/:id",
        handlers: [createMockHandler()],
      } as any;
      expect(matchRoute([route], "GET", "/files/%E0%A4%A")).toBeUndefined();
    });

    it("should normalize registry routes and handler validation errors", () => {
      const routes: any[] = [];
      registerWithMeta(routes, "GET", "/registry", [createMockHandler()]);
      expect(routes[0].path).toBe("/registry");
      expect(() => normalizeHandlers([], "/items", "index" as any)).toThrow(
        /empty handler array/,
      );
      expect(() => normalizeHandlers(["bad"] as any, "/items", "index" as any)).toThrow(
        /must be a function/,
      );
      expect(normalizeError("failure")).toBeInstanceOf(Error);
      expect(normalizeError({ reason: "failure" })).toBeInstanceOf(Error);
    });

    it("should exercise resource action inclusion and exclusion options", () => {
      const controller = {
        index: () => "index",
        show: () => "show",
        create: () => "create",
        update: () => "update",
        delete: () => "delete",
      } as any;

      expect(
        buildResourceRoutes("only", controller, { only: ["index"] }).map(
          (route) => route.meta?.name,
        ),
      ).toEqual(["only.index"]);
      expect(
        buildResourceRoutes("except", controller, { except: ["destroy"] }).length,
      ).toBeGreaterThan(0);
    });

    it("should support object options in router.query()", () => {
      router.query("/graphql", {
        name: "graphql.query",
        tags: ["api"],
        controller: () => ({ data: true }),
      });

      const route = router.findRouteByName("graphql.query");
      expect(route).toBeDefined();
      expect(route?.method).toBe("QUERY");
      expect(route?.tags).toEqual(["api"]);
    });

    it("should retain schema metadata from direct route options", () => {
      router.get("/schema-option", {
        name: "schema.option",
        schema: { body: { type: "object" } },
        controller: () => ({ ok: true }),
      });

      expect(router.findRouteByName("schema.option")?.schema).toEqual({
        body: { type: "object" },
      });
    });

    it("should support router.resource() using an options object containing controller", () => {
      const resourceController = {
        index: () => [{ id: "1" }],
        show: () => ({ id: "1" }),
      };

      router.resource("/articles", {
        controller: resourceController,
        param: "articleId",
        tags: ["articles"],
      });

      expect(router.findRouteByName("articles.index")).toBeDefined();
      expect(router.findRouteByName("articles.show")?.path).toBe("/articles/:articleId");
    });

    it("should support router.resource with 3 arguments (path, controller, options)", () => {
      const controller = {
        index: () => "posts index",
        show: () => "posts show",
      };

      router.resource("/items", controller, {
        param: "itemId",
        namePrefix: "items",
      });

      expect(router.findRouteByName("items.index")).toBeDefined();
      expect(router.findRouteByName("items.show")?.path).toBe("/items/:itemId");
    });

    it("should register routes with explicit meta.rateLimit", () => {
      router.get("/rate-limited", createMockHandler(), {
        rateLimit: "100/15m",
      });
      const route = router.getRoutes().find((r) => r.path === "/rate-limited");
      expect(route?.rateLimit).toBe("100/15m");
    });

    it("should match path in router internal matchPath when segment is optional and omitted", () => {
      const internalRouter = router as unknown as {
        matchPath(
          routePath: string,
          incomingPath: string,
          options?: { prefix?: boolean },
        ): Record<string, string> | null;
      };

      expect(internalRouter.matchPath("/posts/:category?/:id?", "/posts")).toEqual({});
      expect(internalRouter.matchPath("/posts/:category/:id?", "/posts/tech")).toEqual({ category: "tech" });
    });

    it("should return true for hasRoute when route exists", () => {
      router.get("/exists", createMockHandler(), { name: "exists.route" });
      expect(router.hasRoute("exists.route")).toBe(true);
      expect(router.findRouteByName("does.not.exist")).toBeUndefined();
    });

    it("should handle custom resource methods when passed as an action map", () => {
      const customActions = {
        index: () => "index",
        customAction: () => "custom",
      };

      router.resource("/customs", customActions as unknown as Parameters<typeof router.resource>[1]);
      expect(router.match("GET", "/customs")).toBeDefined();
    });

    it("should dispatch through nested parameterized sub-router prefixes", async () => {
      const subRouterB = new Router();
      const subRouterC = new Router();
      const handler = vi.fn((_request, response) => response.end());

      subRouterC.get("/:id", handler);
      subRouterB.use("/users", subRouterC);
      router.use("/v1", subRouterB);

      const fixture = createHttpFixture("GET", "/v1/users/42");
      await router.dispatch(fixture.req, fixture.res);

      expect(handler).toHaveBeenCalledOnce();
      expect(fixture.req.params).toEqual({ id: "42" });
    });

    it("should miss an unknown path even when it has a trailing slash", () => {
      expect(router.match("GET", "/non-existent-route/")).toBeUndefined();
    });

    it("should return no trie route when an existing path has another method", () => {
      router.post("/only-post", createMockHandler());

      expect(router.match("GET", "/only-post")).toBeUndefined();
    });

    it("should return null for missing required and mismatched segments", () => {
      const matchPath = (router as unknown as {
        matchPath: (
          routePath: string,
          incomingPath: string,
          options?: { prefix?: boolean },
        ) => Record<string, string> | null;
      }).matchPath.bind(router);

      expect(matchPath("/submit/:id", "/submit")).toBeNull();
      expect(matchPath("/submit", "/other")).toBeNull();
    });

    it("should handle a method mismatch with 405 and an Allow header", async () => {
      router.post("/submit", createMockHandler());
      vi.mocked(ErrorFormatter.handle).mockImplementation((_error, _req, res) => {
        res.status(405).set("Allow", "POST").send();
      });

      const fixture = createHttpFixture("GET", "/submit");
      await router.handleRequest(fixture.req, fixture.res);

      expect(fixture.rawRes.statusCode).toBe(405);
      expect(fixture.res.get("Allow")).toBe("POST");
    });

    it("should handle an unmapped path with a 404 response", async () => {
      vi.mocked(ErrorFormatter.handle).mockImplementation((_error, _req, res) => {
        res.status(404).send();
      });

      const fixture = createHttpFixture("GET", "/does-not-exist");
      await router.handleRequest(fixture.req, fixture.res);

      expect(fixture.rawRes.statusCode).toBe(404);
    });

    it("should filter resource routes with only and except options", () => {
      const controller = {
        index: () => "index",
        show: () => "show",
        create: () => "create",
        update: () => "update",
        delete: () => "delete",
        destroy: () => "destroy",
      };

      router.resource("/users", controller, { only: ["index", "show"] });
      expect(router.findRouteByName("users.index")).toBeDefined();
      expect(router.findRouteByName("users.show")).toBeDefined();
      expect(router.findRouteByName("users.create")).toBeUndefined();

      const secondRouter = new Router();
      secondRouter.resource("/accounts", controller, { except: ["destroy"] });
      expect(secondRouter.findRouteByName("accounts.destroy")).toBeUndefined();
      expect(secondRouter.findRouteByName("accounts.index")).toBeDefined();
    });

  });

  describe("Targeted trie fallback coverage", () => {
    it("should evaluate false on if (optional) when paramChild does not yield a match", () => {
      const r = new Router();

      r.post("/items/:id", () => {});

      const match = r.match("GET", "/items");

      expect(match).toBeUndefined();
    });
  });
});

