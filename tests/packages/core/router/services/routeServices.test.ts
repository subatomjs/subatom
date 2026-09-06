import { describe, expect, it, vi } from "vitest";
import { registerPossiblyGrouped, registerGroupRoute } from "../../../../../packages/core/router/services/routeRegistrar.service.js";
import { registerWithMeta } from "../../../../../packages/core/router/services/routeRegistry.service.js";
import { matchRoute } from "../../../../../packages/core/router/services/routeMatcher.service.js";
import { collectUseMiddlewares } from "../../../../../packages/core/router/services/middlewareCollector.service.js";
import { extractPathname, extractQuery } from "../../../../../packages/core/router/services/urlParser.service.js";
import { mergeRouter, mergeSubRouter } from "../../../../../packages/core/router/services/routerMerger.service.js";
import type { IGroupContext } from "../../../../../packages/core/server/types/subatom.server.types.js";
import type { IHandler, IRoute, IRouter, RouteArgument } from "../../../../../packages/core/router/types/router.types.js";
import type { Router } from "../../../../../packages/core/router/Router.js";
import { matchPath } from "../../../../../packages/core/router/services/pathMatch.service.js";

vi.mock("../../../../../packages/methods/uuid.js", () => ({
  uuid: { short: vi.fn(() => "generated-name") },
}));

const handler = vi.fn<IHandler>();
const secondHandler = vi.fn<IHandler>();

function makeRoute(overrides: Partial<IRoute> = {}): IRoute {
  return {
    method: "GET",
    path: "/users/:id",
    handlers: [handler],
    ...overrides,
  };
}

describe("router service modules", () => {
  describe("URL parsing", () => {
    it("should return the root pathname when the URL path is empty", () => {
      const rawUrl = "?page=2";
      const pathname = extractPathname(rawUrl);
      expect(pathname).toBe("/");
    });

    it("should return the path before the query string", () => {
      const rawUrl = "/users?page=2&sort=name";
      const pathname = extractPathname(rawUrl);
      expect(pathname).toBe("/users");
    });

    it("should decode query entries and return an empty object without a query", () => {
      const rawUrl = "/users?page=2&name=Jane%20Doe";
      const query = extractQuery(rawUrl);
      expect(query).toEqual({ page: "2", name: "Jane Doe" });
      expect(extractQuery("/users")).toEqual({});
    });
  });

  describe("route matching", () => {
    it("should match a route and expose params and query values", () => {
      const route = makeRoute();
      const result = matchRoute([route], "GET", "/users/42?active=true");
      expect(result).toEqual({ route, params: { id: "42" }, query: { active: "true" } });
    });

    it("should use GET defaults, skip middleware, and match ALL routes", () => {
      const middleware = makeRoute({ method: "USE", path: "/users" });
      const wildcard = makeRoute({ method: "ALL", path: "/health" });

      const defaultResult = matchRoute([middleware, makeRoute({ path: "/users/:id" })], undefined, "/users/1");
      const wildcardResult = matchRoute([wildcard], "POST", "/health");

      expect(defaultResult?.params).toEqual({ id: "1" });
      expect(wildcardResult?.route).toBe(wildcard);
    });

    it("should return undefined when method or path does not match", () => {
      const route = makeRoute();
      const result = matchRoute([route], "POST", "/missing");
      expect(result).toBeUndefined();
    });

    it("should default an empty method to GET", () => {
      const route = makeRoute({ method: "GET", path: "/default-method" });

      expect(matchRoute([route], "", "/default-method")?.route).toBe(route);
    });
  });

  describe("middleware collection", () => {
    it("should collect matching USE handlers and inherited params", () => {
      const routes = [
        makeRoute({ method: "USE", path: "/teams/:teamId", handlers: [handler] }),
        makeRoute({ method: "GET", path: "/teams/:teamId/users", handlers: [secondHandler] }),
        makeRoute({ method: "USE", path: "/other", handlers: [secondHandler] }),
      ];

      const result = collectUseMiddlewares(routes, "/teams/blue/users");
      expect(result.handlers).toEqual([handler]);
      expect(result.params).toEqual({ teamId: "blue" });
    });

    it("should return empty middleware and params when no USE route matches", () => {
      const routes = [makeRoute({ method: "GET", path: "/users" })];
      const result = collectUseMiddlewares(routes, "/other");
      expect(result.handlers).toEqual([]);
      expect(result.params).toEqual({});
    });
  });

  describe("route registry", () => {
    it("should normalize a route and retain supplied metadata", () => {
      const routes: IRoute[] = [];
      const schema = { body: { type: "object" } };

      registerWithMeta(routes, "get", "//users//", [handler], {
        name: "users",
        tags: ["public"],
        rateLimit: "10/minute",
        schema,
      });

      expect(routes).toEqual([{ method: "GET", name: "users", path: "/users/", handlers: [handler], tags: ["public"], rateLimit: "10/minute" }]);
    });

    it("should register routes without optional metadata", () => {
      const routes: IRoute[] = [];

      registerWithMeta(routes, "GET", "/plain", [handler], {});

      expect(routes[0]?.tags).toBeUndefined();
      expect(routes[0]?.rateLimit).toBeUndefined();
    });

    it("should generate a name and reject invalid methods, handlers, and handler entries", () => {
      const routes: IRoute[] = [];

      expect(() => registerWithMeta(routes, "", "/", [handler])).toThrow(TypeError);
      expect(() => registerWithMeta(routes, "GET", "/", [])).toThrow(TypeError);
      expect(() => registerWithMeta(routes, "GET", "/", ["not a handler" as unknown as IHandler])).toThrow(TypeError);
      registerWithMeta(routes, "get", "", [handler]);

      expect(routes[0]?.name).toBe("generated-name");
      expect(routes[0]?.path).toBe("/");
    });

    it("should use the default path in registry validation errors", () => {
      const routes: IRoute[] = [];

      expect(() => registerWithMeta(routes, "GET", "", [])).toThrow(/route "GET \/"/);
      expect(() =>
        registerWithMeta(routes, "GET", "", ["invalid" as unknown as IHandler]),
      ).toThrow(/route "GET \/"/);
    });
  });

  describe("route registration", () => {
    it("should register a grouped options route with merged metadata", () => {
      const registerWithMetaMock = vi.fn();
      const router = { registerWithMeta: registerWithMetaMock } as unknown as Router;
      const context: IGroupContext = {
        prefix: "/api",
        middlewares: [handler],
        tags: ["group"],
        rateLimitSpec: "5/minute",
        rateLimitMiddleware: undefined,
      };
      const controller = vi.fn();

      registerPossiblyGrouped(router, context, "GET", "/users", [{ controller, tags: ["route", "group"] }]);

      expect(registerWithMetaMock).toHaveBeenCalledWith("GET", "/api/users", [controller], {
        name: undefined,
        tags: ["group", "route"],
        rateLimit: "5/minute",
        schema: undefined,
      });
    });

    it("should register ungrouped options and ordinary handler routes", () => {
      const getMock = vi.fn();
      const registerWithMetaMock = vi.fn();
      const router = { get: getMock, registerWithMeta: registerWithMetaMock } as unknown as Router;
      const controller = vi.fn();

      registerPossiblyGrouped(router, undefined, "GET", "/users", [{ controller }]);
      registerPossiblyGrouped(router, undefined, "POST", "/users", [handler, { name: "users" }]);

      expect(getMock).toHaveBeenCalledWith("/users", { controller });
      expect(registerWithMetaMock).toHaveBeenCalledWith("POST", "/users", [handler], { name: "users" });
    });

    it("should handle ordinary handlers registered with group context including custom rateLimit and schema in options object", () => {
      const registerWithMetaMock = vi.fn();
      const router = { registerWithMeta: registerWithMetaMock } as unknown as Router;
      const context: IGroupContext = {
        prefix: "/v1",
        middlewares: [handler],
        tags: ["api"],
        rateLimitSpec: "100/15m",
        rateLimitMiddleware: undefined,
      };

      registerPossiblyGrouped(router, context, "PUT", "/profile", [
        secondHandler,
        {
          name: "profile.update",
          schema: { body: { type: "object" } },
        },
      ]);

      expect(registerWithMetaMock).toHaveBeenCalledWith("PUT", "/v1/profile", [handler, secondHandler], {
        name: "profile.update",
        tags: ["api"],
        rateLimit: "100/15m",
        schema: { body: { type: "object" } },
      });
    });

    it("should reject invalid route paths and missing handlers", () => {
      const router = { registerWithMeta: vi.fn() } as unknown as Router;

      expect(() => registerPossiblyGrouped(router, undefined, "GET", "", [handler])).toThrow(TypeError);
      expect(() => registerPossiblyGrouped(router, undefined, "GET", "/users", [])).toThrow(TypeError);
    });

    it("should register clean group metadata and group middleware", () => {
      const registerWithMetaMock = vi.fn();
      const router = { registerWithMeta: registerWithMetaMock } as unknown as Router;
      const context: IGroupContext = {
        prefix: "/api",
        middlewares: [handler],
        tags: [],
        rateLimitSpec: undefined,
        rateLimitMiddleware: secondHandler,
      };

      registerGroupRoute(router, "GET", "/users", [handler], {
        tags: undefined,
        rateLimit: "1/minute",
        name: undefined,
        schema: undefined,
      });
      registerPossiblyGrouped(router, context, "GET", "/users", [handler, { schema: { query: {} } }]);

      expect(registerWithMetaMock).toHaveBeenNthCalledWith(1, "GET", "/users", [handler], { rateLimit: "1/minute" });
      expect(registerWithMetaMock).toHaveBeenNthCalledWith(2, "GET", "/api/users", [secondHandler, handler, handler], { schema: { query: {} } });
    });

    it("should retain every group metadata field and map inline middleware", () => {
      const registerWithMetaMock = vi.fn();
      const router = { registerWithMeta: registerWithMetaMock } as unknown as Router;
      const inlineMiddleware = vi.fn();
      const controller = vi.fn();

      registerGroupRoute(router, "GET", "/all-meta", [handler], {
        tags: ["all"],
        rateLimit: "10/m",
        name: "all.meta",
        schema: { body: {} },
      });
      registerPossiblyGrouped(
        router,
        { prefix: "/api", middlewares: [], tags: [], rateLimitSpec: undefined, rateLimitMiddleware: undefined },
        "GET",
        "/inline",
        [{ controller, middleware: [inlineMiddleware] }],
      );

      expect(registerWithMetaMock).toHaveBeenNthCalledWith(
        1,
        "GET",
        "/all-meta",
        [handler],
        { tags: ["all"], rateLimit: "10/m", name: "all.meta", schema: { body: {} } },
      );
      expect(registerWithMetaMock).toHaveBeenNthCalledWith(
        2,
        "GET",
        "/api/inline",
        [inlineMiddleware, controller],
        { name: undefined, tags: undefined, rateLimit: undefined, schema: undefined },
      );
    });

    it("should register a group route with no optional metadata", () => {
      const registerWithMetaMock = vi.fn();
      const router = { registerWithMeta: registerWithMetaMock } as unknown as Router;

      registerGroupRoute(router, "GET", "/minimal", [handler], {});

      expect(registerWithMetaMock).toHaveBeenCalledWith(
        "GET",
        "/minimal",
        [handler],
        {},
      );
    });
  });

  describe("router merging", () => {
    it("should merge routes with a prefix and preserve metadata", () => {
      const registerMountedRouteMock = vi.fn();
      const target = {
        findRouteByName: vi.fn(() => undefined),
        registerMountedRoute: registerMountedRouteMock,
      } as unknown as Router;
      const sourceRoute = makeRoute({ name: "user.show", tags: ["users"], rateLimit: "10/minute" });
      const source = { getRoutes: vi.fn(() => [sourceRoute]) } as unknown as IRouter;

      mergeSubRouter(target, "/api", source);

      expect(registerMountedRouteMock).toHaveBeenCalledWith({
        method: "GET",
        path: "/api/users/:id",
        handlers: [handler],
        name: "user.show",
        tags: ["users"],
        rateLimit: "10/minute",
      });
    });
it("should reject invalid routers and duplicate names, and merge unprefixed routes", () => {
      const target = {
        findRouteByName: vi.fn(() => makeRoute({ name: "duplicate" })),
        registerMountedRoute: vi.fn(),
      } as unknown as Router;
      const sourceRoute = makeRoute({ name: "duplicate" });
      const source = { getRoutes: vi.fn(() => [sourceRoute]) } as unknown as IRouter;
      const validSource = { getRoutes: vi.fn(() => [makeRoute({ name: undefined })]) } as unknown as IRouter;

      expect(() => mergeSubRouter(target, "/api", {} as unknown as IRouter)).toThrow(TypeError);
      expect(() => mergeSubRouter(target, "/api", source)).toThrow(TypeError);
      mergeRouter(target, validSource);
      expect(() => mergeRouter(target, {} as unknown as IRouter)).toThrow(TypeError);
    });

    it("should match path with trailing slash differences", () => {
    // pathMatch line 51: trailing slash segment normalization
    expect(matchPath("/users/", "/users")).toEqual({});
    expect(matchPath("/users", "/users/")).toEqual({});
  });

  it("should register group routes without context options", () => {
    // routeRegistrar line 59: fallback when options or context meta are undefined
    const mockRouter = { registerWithMeta: vi.fn() } as unknown as Router;
    registerPossiblyGrouped(mockRouter, undefined, "GET", "/plain", [vi.fn() as unknown as RouteArgument]);
    expect((mockRouter as any).registerWithMeta).toHaveBeenCalled();
  });

    it("should cover all optional metadata branches in registerPossiblyGrouped", () => {
      const registerWithMetaMock = vi.fn();
      const router = { registerWithMeta: registerWithMetaMock } as unknown as Router;
      const context: IGroupContext = {
        prefix: "/api",
        middlewares: [handler],
        tags: [],
        rateLimitSpec: undefined,
        rateLimitMiddleware: undefined,
      };

      registerPossiblyGrouped(router, context, "GET", "/no-tags", [{ controller: vi.fn() }]);
      expect(registerWithMetaMock).toHaveBeenCalledWith("GET", "/api/no-tags", expect.any(Array), {
        name: undefined,
        tags: undefined,
        rateLimit: undefined,
        schema: undefined,
      });
    });

    it("should merge context tags when options tags are omitted in registerPossiblyGrouped", () => {
      const registerWithMetaMock = vi.fn();
      const router = { registerWithMeta: registerWithMetaMock } as unknown as Router;
      const context: IGroupContext = {
        prefix: "/api",
        middlewares: [handler],
        tags: ["admin", "v1"],
        rateLimitSpec: "60/m",
        rateLimitMiddleware: undefined,
      };

      registerPossiblyGrouped(router, context, "GET", "/settings", [{ controller: vi.fn() }]);
      expect(registerWithMetaMock).toHaveBeenCalledWith("GET", "/api/settings", expect.any(Array), {
        name: undefined,
        tags: ["admin", "v1"],
        rateLimit: "60/m",
        schema: undefined,
      });

      registerPossiblyGrouped(router, context, "POST", "/action", [handler]);
      expect(registerWithMetaMock).toHaveBeenCalledWith("POST", "/api/action", expect.any(Array), {
        name: undefined,
        tags: ["admin", "v1"],
        rateLimit: "60/m",
        schema: undefined,
      });
    });

    it("should merge sub-router routes with undefined optional fields", () => {
      const registerMountedRouteMock = vi.fn();
      const target = {
        findRouteByName: vi.fn(() => undefined),
        registerMountedRoute: registerMountedRouteMock,
      } as unknown as Router;

      const minimalistRoute: IRoute = {
        method: "GET",
        path: "/simple",
        handlers: [handler],
      };

      const source = { getRoutes: vi.fn(() => [minimalistRoute]) } as unknown as IRouter;
      mergeSubRouter(target, "/mount", source);

      expect(registerMountedRouteMock).toHaveBeenCalledWith({
        method: "GET",
        path: "/mount/simple",
        handlers: [handler],
      });
    });

    it("should copy all optional route fields when merging sub-router", () => {
      const registerMountedRouteMock = vi.fn();
      const target = {
        findRouteByName: vi.fn(() => undefined),
        registerMountedRoute: registerMountedRouteMock,
      } as unknown as Router;

      const sourceRoute: IRoute = {
        method: "POST",
        path: "/items",
        handlers: [handler],
        tags: ["items"],
        rateLimit: "20/m",
        name: "items.create",
        schema: { body: { type: "object" } },
        routerPipeline: { transformers: [], interceptors: [], serializers: [] },
      };

      const source = { getRoutes: vi.fn(() => [sourceRoute]) } as unknown as IRouter;
      mergeSubRouter(target, "/v1", source);

      expect(registerMountedRouteMock).toHaveBeenCalledWith({
        method: "POST",
        path: "/v1/items",
        handlers: [handler],
        tags: ["items"],
        rateLimit: "20/m",
        name: "items.create",
        schema: { body: { type: "object" } },
        routerPipeline: { transformers: [], interceptors: [], serializers: [] },
      });
    });
  });
});