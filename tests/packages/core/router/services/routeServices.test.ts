import { describe, expect, it, vi } from "vitest";
import { registerPossiblyGrouped, registerGroupRoute } from "../../../../../packages/core/router/services/routeRegistrar.service.js";
import { registerWithMeta } from "../../../../../packages/core/router/services/routeRegistry.service.js";
import { matchRoute } from "../../../../../packages/core/router/services/routeMatcher.service.js";
import { collectUseMiddlewares } from "../../../../../packages/core/router/services/middlewareCollector.service.js";
import { extractPathname, extractQuery } from "../../../../../packages/core/router/services/urlParser.service.js";
import { mergeRouter, mergeSubRouter } from "../../../../../packages/core/router/services/routerMerger.service.js";
import type { IGroupContext } from "../../../../../packages/core/server/types/subatom.server.types.js";
import type { IHandler, IRoute, IRouter } from "../../../../../packages/core/router/types/router.types.js";
import type { Router } from "../../../../../packages/core/router/Router.js";

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
      // Arrange
      const rawUrl = "?page=2";

      // Act
      const pathname = extractPathname(rawUrl);

      // Assert
      expect(pathname).toBe("/");
    });

    it("should return the path before the query string", () => {
      // Arrange
      const rawUrl = "/users?page=2&sort=name";

      // Act
      const pathname = extractPathname(rawUrl);

      // Assert
      expect(pathname).toBe("/users");
    });

    it("should decode query entries and return an empty object without a query", () => {
      // Arrange
      const rawUrl = "/users?page=2&name=Jane%20Doe";

      // Act
      const query = extractQuery(rawUrl);

      // Assert
      expect(query).toEqual({ page: "2", name: "Jane Doe" });
      expect(extractQuery("/users")).toEqual({});
    });
  });

  describe("route matching", () => {
    it("should match a route and expose params and query values", () => {
      // Arrange
      const route = makeRoute();

      // Act
      const result = matchRoute([route], "GET", "/users/42?active=true");

      // Assert
      expect(result).toEqual({ route, params: { id: "42" }, query: { active: "true" } });
    });

    it("should use GET defaults, skip middleware, and match ALL routes", () => {
      // Arrange
      const middleware = makeRoute({ method: "USE", path: "/users" });
      const wildcard = makeRoute({ method: "ALL", path: "/health" });

      // Act
      const defaultResult = matchRoute([middleware, makeRoute({ path: "/users/:id" })], undefined, "/users/1");
      const wildcardResult = matchRoute([wildcard], "POST", "/health");

      // Assert
      expect(defaultResult?.params).toEqual({ id: "1" });
      expect(wildcardResult?.route).toBe(wildcard);
    });

    it("should return undefined when method or path does not match", () => {
      // Arrange
      const route = makeRoute();

      // Act
      const result = matchRoute([route], "POST", "/missing");

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe("middleware collection", () => {
    it("should collect matching USE handlers and inherited params", () => {
      // Arrange
      const routes = [
        makeRoute({ method: "USE", path: "/teams/:teamId", handlers: [handler] }),
        makeRoute({ method: "GET", path: "/teams/:teamId/users", handlers: [secondHandler] }),
        makeRoute({ method: "USE", path: "/other", handlers: [secondHandler] }),
      ];

      // Act
      const result = collectUseMiddlewares(routes, "/teams/blue/users");

      // Assert
      expect(result.handlers).toEqual([handler]);
      expect(result.params).toEqual({ teamId: "blue" });
    });

    it("should return empty middleware and params when no USE route matches", () => {
      // Arrange
      const routes = [makeRoute({ method: "GET", path: "/users" })];

      // Act
      const result = collectUseMiddlewares(routes, "/other");

      // Assert
      expect(result.handlers).toEqual([]);
      expect(result.params).toEqual({});
    });
  });

  describe("route registry", () => {
    it("should normalize a route and retain supplied metadata", () => {
      // Arrange
      const routes: IRoute[] = [];
      const schema = { body: { type: "object" } };

      // Act
      registerWithMeta(routes, "get", "//users//", [handler], {
        name: "users",
        tags: ["public"],
        rateLimit: "10/minute",
        schema,
      });

      // Assert
      expect(routes).toEqual([{ method: "GET", name: "users", path: "/users/", handlers: [handler], tags: ["public"], rateLimit: "10/minute" }]);
    });

    it("should generate a name and reject invalid methods, handlers, and handler entries", () => {
      // Arrange
      const routes: IRoute[] = [];

      // Act and Assert
      expect(() => registerWithMeta(routes, "", "/", [handler])).toThrow(TypeError);
      expect(() => registerWithMeta(routes, "GET", "/", [])).toThrow(TypeError);
      expect(() => registerWithMeta(routes, "GET", "/", ["not a handler" as unknown as IHandler])).toThrow(TypeError);
      registerWithMeta(routes, "get", "", [handler]);

      // Assert
      expect(routes[0]?.name).toBe("generated-name");
      expect(routes[0]?.path).toBe("/");
    });
  });

  describe("route registration", () => {
    it("should register a grouped options route with merged metadata", () => {
      // Arrange
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

      // Act
      registerPossiblyGrouped(router, context, "GET", "/users", [{ controller, tags: ["route", "group"] }]);

      // Assert
      expect(registerWithMetaMock).toHaveBeenCalledWith("GET", "/api/users", [controller], {
        name: undefined,
        tags: ["group", "route"],
        rateLimit: "5/minute",
        schema: undefined,
      });
    });

    it("should register ungrouped options and ordinary handler routes", () => {
      // Arrange
      const getMock = vi.fn();
      const registerWithMetaMock = vi.fn();
      const router = { get: getMock, registerWithMeta: registerWithMetaMock } as unknown as Router;
      const controller = vi.fn();

      // Act
      registerPossiblyGrouped(router, undefined, "GET", "/users", [{ controller }]);
      registerPossiblyGrouped(router, undefined, "POST", "/users", [handler, { name: "users" }]);

      // Assert
      expect(getMock).toHaveBeenCalledWith("/users", { controller });
      expect(registerWithMetaMock).toHaveBeenCalledWith("POST", "/users", [handler], { name: "users" });
    });

    it("should reject invalid route paths and missing handlers", () => {
      // Arrange
      const router = { registerWithMeta: vi.fn() } as unknown as Router;

      // Act and Assert
      expect(() => registerPossiblyGrouped(router, undefined, "GET", "", [handler])).toThrow(TypeError);
      expect(() => registerPossiblyGrouped(router, undefined, "GET", "/users", [])).toThrow(TypeError);
    });

    it("should register clean group metadata and group middleware", () => {
      // Arrange
      const registerWithMetaMock = vi.fn();
      const router = { registerWithMeta: registerWithMetaMock } as unknown as Router;
      const context: IGroupContext = {
        prefix: "/api",
        middlewares: [handler],
        tags: [],
        rateLimitSpec: undefined,
        rateLimitMiddleware: secondHandler,
      };

      // Act
      registerGroupRoute(router, "GET", "/users", [handler], {
        tags: undefined,
        rateLimit: "1/minute",
        name: undefined,
        schema: undefined,
      });
      registerPossiblyGrouped(router, context, "GET", "/users", [handler, { schema: { query: {} } }]);

      // Assert
      expect(registerWithMetaMock).toHaveBeenNthCalledWith(1, "GET", "/users", [handler], { rateLimit: "1/minute" });
      expect(registerWithMetaMock).toHaveBeenNthCalledWith(2, "GET", "/api/users", [secondHandler, handler, handler], { schema: { query: {} } });
    });
  });

  describe("router merging", () => {
    it("should merge routes with a prefix and preserve metadata", () => {
      // Arrange
      const registerMountedRouteMock = vi.fn();
      const target = {
        findRouteByName: vi.fn(() => undefined),
        registerMountedRoute: registerMountedRouteMock,
      } as unknown as Router;
      const sourceRoute = makeRoute({ name: "user.show", tags: ["users"], rateLimit: "10/minute" });
      const source = { getRoutes: vi.fn(() => [sourceRoute]) } as unknown as IRouter;

      // Act
      mergeSubRouter(target, "/api", source);

      // Assert
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
      // Arrange
      const target = {
        findRouteByName: vi.fn(() => makeRoute({ name: "duplicate" })),
        registerMountedRoute: vi.fn(),
      } as unknown as Router;
      const sourceRoute = makeRoute({ name: "duplicate" });
      const source = { getRoutes: vi.fn(() => [sourceRoute]) } as unknown as IRouter;
      const validSource = { getRoutes: vi.fn(() => [makeRoute({ name: undefined })]) } as unknown as IRouter;

      // Act and Assert
      expect(() => mergeSubRouter(target, "/api", {})).toThrow(TypeError);
      expect(() => mergeSubRouter(target, "/api", source)).toThrow(TypeError);
      mergeRouter(target, validSource);
      expect(() => mergeRouter(target, {})).toThrow(TypeError);
    });
  });
});
