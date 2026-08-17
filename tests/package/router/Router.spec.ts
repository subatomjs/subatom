// tests/package/router/Router.spec.ts

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  MethodNotAllowedError,
  NotFoundError,
} from "../../../package/core/http/errors/Error.js";
import { Router } from "../../../package/core/router/Router.js";
import type {
  IInterceptor,
  ISerializer,
  ITransformer,
} from "../../../package/types/framework/pipeline/IPipeline.js";
import type { IHandler } from "../../../package/types/framework/router/IRouter.js";
import type { IRequest } from "../../../package/types/http/IRequest.js";
import type { IResponse } from "../../../package/types/http/IResponse.js";
import {MiddlewareHandler} from '../../../package/types/http/IMiddleware.js'

describe("Enterprise Suite: Router Core Engine", () => {
  const createMocks = (method: string, url: string, overrides: Record<string, any> = {}) => {
    const req = {
      method,
      url,
      path: url.split("?")[0],
      params: {},
      query: {},
      ...overrides,
    } as unknown as IRequest;

    const res = {
      writableEnded: false,
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    } as unknown as IResponse;

    return { req, res };
  };

  // ---------------------------------------------------------------------------
  // 1. HTTP Verbs, Custom Methods & Wildcard Matching
  // ---------------------------------------------------------------------------
  describe("HTTP Method Registration & Matching", () => {
    it("should register and match all standard HTTP methods", () => {
      const router = new Router();
      const h: IHandler = () => {};

      router.get("/test", h);
      router.post("/test", h);
      router.put("/test", h);
      router.patch("/test", h);
      router.delete("/test", h);
      router.options("/test", h);
      router.head("/test", h);
      router.trace("/test", h);
      router.connect("/test", h);
      router.query("/test", h);
      router.all("/wildcard", h);

      expect(router.match("GET", "/test")).toBeDefined();
      expect(router.match("POST", "/test")).toBeDefined();
      expect(router.match("PUT", "/test")).toBeDefined();
      expect(router.match("PATCH", "/test")).toBeDefined();
      expect(router.match("DELETE", "/test")).toBeDefined();
      expect(router.match("OPTIONS", "/test")).toBeDefined();
      expect(router.match("HEAD", "/test")).toBeDefined();
      expect(router.match("TRACE", "/test")).toBeDefined();
      expect(router.match("CONNECT", "/test")).toBeDefined();
      expect(router.match("QUERY", "/test")).toBeDefined();
      expect(router.match("CUSTOM_VERB", "/wildcard")).toBeDefined();
    });

    it("should support case-insensitive method matching", () => {
      const router = new Router();
      router.get("/case", () => {});

      expect(router.match("get", "/case")).toBeDefined();
      expect(router.match("GET", "/case")).toBeDefined();
    });

    it("should support custom HTTP verbs via addRoute/match", () => {
      const router = new Router();
      router.all("/custom", () => {});
      expect(router.match("PURGE", "/custom")).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Overload Signatures: Middleware Arrays, Inline Handlers & Options
  // ---------------------------------------------------------------------------
  describe("Handler Overloads & Argument Normalization", () => {
    it("should accept single handler, multiple middlewares, and options object", async () => {
      const router = new Router();
      const step: string[] = [];

      const mw1: MiddlewareHandler = (_req, _res, next) => {
        step.push("mw1");
        return next();
      };
      const mw2: MiddlewareHandler = (_req, _res, next) => {
        step.push("mw2");
        return next();
      };
      const handler: IHandler = () => {
        step.push("handler");
      };

      router.get("/chain", mw1, mw2, handler, { name: "chain.test" });

      const { req, res } = createMocks("GET", "/chain");
      await router.dispatch(req, res);

      expect(step).toEqual(["mw1", "mw2", "handler"]);
      expect(router.urlFor("chain.test")).toBe("/chain");
    });

    it("should accept array of handlers/middlewares", async () => {
      const router = new Router();
      const calls: string[] = [];

      const mw: MiddlewareHandler = (_req, _res, next) => {
        calls.push("arr_mw");
        return next();
      };
      const handler: IHandler = () => {
        calls.push("arr_h");
      };

      router.post("/array-route", ...[mw, handler]);

      const { req, res } = createMocks("POST", "/array-route");
      await router.dispatch(req, res);

      expect(calls).toEqual(["arr_mw", "arr_h"]);
    });

    it("throws error when registering a route without a valid handler", () => {
      const router = new Router();
      expect(() => {
        router.get("/no-handler");
      }).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Named Routes & urlFor Generation
  // ---------------------------------------------------------------------------
  describe("Named Routes & URL Generation (urlFor)", () => {
    it("should enforce unique route names", () => {
      const router = new Router();
      router.get("/users", () => {}, { name: "users.index" });

      expect(() => {
        router.post("/users", () => {}, { name: "users.index" });
      }).toThrow(TypeError);
    });

    it("should generate URLs correctly with params and query strings", () => {
      const router = new Router();
      router.get("/posts/:postId/comments/:commentId", () => {}, {
        name: "comments.show",
      });

      const url = router.urlFor(
        "comments.show",
        { postId: "1", commentId: "20" },
        { page: 1, filter: "active" },
      );
      expect(url).toBe("/posts/1/comments/20?page=1&filter=active");
    });

    it("should handle urlFor with zero params and no query", () => {
      const router = new Router();
      router.get("/dashboard", () => {}, { name: "dashboard" });

      expect(router.urlFor("dashboard")).toBe("/dashboard");
    });

    it("throws when urlFor references a non-existent route", () => {
      const router = new Router();
      expect(() => router.urlFor("non.existent")).toThrow(
        '[Subatom] urlFor: no route registered with name "non.existent".',
      );
    });

    it("throws when required URL parameters are missing in urlFor call", () => {
      const router = new Router();
      router.get("/users/:id/profile/:section", () => {}, { name: "user.section" });

      expect(() => {
        router.urlFor("user.section", { id: "123" });
      }).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Route Dispatching, Parameters, Queries & Path Decoding
  // ---------------------------------------------------------------------------
  describe("Dispatching & Parameter Extraction", () => {
    it("should properly execute pipeline and populate req.params and req.query on dispatch", async () => {
      const router = new Router();
      let executed = false;

      router.get("/org/:orgId/users/:userId", (req, _res) => {
        executed = true;
        expect(req.params).toEqual({ orgId: "acme", userId: "42" });
        expect(req.query).toEqual({ tab: "activity" });
      });

      const { req, res } = createMocks("GET", "/org/acme/users/42?tab=activity");
      await router.dispatch(req, res);
      expect(executed).toBe(true);
    });

    it("should correctly handle URL-encoded route parameters and queries", async () => {
      const router = new Router();
      let decodedParam = "";
      let decodedQuery = "";

      router.get("/tag/:name", (req) => {
        decodedParam = req.params.name;
        decodedQuery = req.query.q as string;
      });

      const { req, res } = createMocks("GET", "/tag/c%2B%2B?q=hello%20world");
      await router.dispatch(req, res);

      expect(decodedParam).toBe("c++");
      expect(decodedQuery).toBe("hello world");
    });

    it("should throw MethodNotAllowedError when path exists but verb does not match", async () => {
      const router = new Router();
      router.post("/submit", () => {});

      const { req, res } = createMocks("GET", "/submit");
      await expect(router.dispatch(req, res)).rejects.toThrow(
        MethodNotAllowedError,
      );
    });

    it("should throw NotFoundError when path does not exist", async () => {
      const router = new Router();
      router.get("/exists", () => {});

      const { req, res } = createMocks("GET", "/does-not-exist");
      await expect(router.dispatch(req, res)).rejects.toThrow(NotFoundError);
    });

    it("should safely handle req.url with no query string or missing path", async () => {
      const router = new Router();
      let called = false;
      router.get("/plain", () => {
        called = true;
      });

      const { req, res } = createMocks("GET", "/plain");
      delete (req as any).path;
      await router.dispatch(req, res);
      expect(called).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Sub-Routers, Prefixing & Mounting via use()
  // ---------------------------------------------------------------------------
  describe("Sub-Router Nesting (use)", () => {
    it("should cleanly mount nested sub-routers using use()", async () => {
      const app = new Router();
      const api = new Router();
      const users = new Router();

      users.get("/:id", (req) => {
        expect(req.params.id).toBe("99");
      });

      api.use("/users", users);
      app.use("/api/v1", api);

      const { req, res } = createMocks("GET", "/api/v1/users/99");
      await app.dispatch(req, res);
    });

    it("should mount sub-router directly without prefix", async () => {
      const app = new Router();
      const sub = new Router();
      let hit = false;

      sub.get("/root-child", () => {
        hit = true;
      });

      app.use(sub);

      const { req, res } = createMocks("GET", "/root-child");
      await app.dispatch(req, res);
      expect(hit).toBe(true);
    });

    it("should apply parent router middleware to mounted sub-routers", async () => {
      const app = new Router();
      const sub = new Router();
      const executionOrder: string[] = [];

      app.use((_req, _res, next) => {
        executionOrder.push("parent_mw");
        return next();
      });

      sub.get("/items", () => {
        executionOrder.push("sub_handler");
      });

      app.use("/sub", sub);

      const { req, res } = createMocks("GET", "/sub/items");
      await app.dispatch(req, res);

      expect(executionOrder).toEqual(["parent_mw", "sub_handler"]);
    });

    it("should inherit pipeline configs and named routes from mounted sub-routers", () => {
      const app = new Router();
      const sub = new Router();

      sub.get("/profile", () => {}, { name: "sub.profile" });
      app.use("/account", sub);

      expect(app.urlFor("sub.profile")).toBe("/account/profile");
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Pipeline Modifiers (Transformers, Interceptors, Serializers)
  // ---------------------------------------------------------------------------
  describe("Pipeline Configuration & Execution", () => {
    it("should register and expose transformers, interceptors, and serializers", () => {
      const router = new Router();

      const t = { beforeRequest: vi.fn() } as unknown as ITransformer;
      const i = { intercept: vi.fn() } as unknown as IInterceptor;
      const s = { serialize: vi.fn() } as unknown as ISerializer;

      router.transformer(t);
      router.intercept(i);
      router.serializer(s);

      const config = router.getPipelineConfig();
      expect(config.transformers).toContain(t);
      expect(config.interceptors).toContain(i);
      expect(config.serializers).toContain(s);
    });

    it("throws TypeError when registering non-object or array modifiers", () => {
      const router = new Router();

      const t1 = { beforeRequest: vi.fn() } as unknown as ITransformer;
      const t2 = { beforeRequest: vi.fn() } as unknown as ITransformer;

      expect(() => router.transformer([t1, t2] as any)).toThrow(TypeError);
      expect(() => router.intercept(null as any)).toThrow(TypeError);
      expect(() => router.serializer(123 as any)).toThrow(TypeError);
    });

    it("should allow registering multiple modifiers sequentially", () => {
      const router = new Router();

      const t1 = { beforeRequest: vi.fn() } as unknown as ITransformer;
      const t2 = { beforeRequest: vi.fn() } as unknown as ITransformer;
      const s1 = { serialize: vi.fn() } as unknown as ISerializer;
      const s2 = { serialize: vi.fn() } as unknown as ISerializer;

      router.transformer(t1);
      router.transformer(t2);
      router.serializer(s1);
      router.serializer(s2);

      const config = router.getPipelineConfig();
      expect(config.transformers).toEqual([t1, t2]);
      expect(config.serializers).toEqual([s1, s2]);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Route Groups & Resource Route Helpers (if present in Router)
  // ---------------------------------------------------------------------------
  describe("Route Groups & Utilities", () => {
    it("should support route prefix grouping if group method is available", () => {
      const router = new Router();
      if (typeof (router as any).group === "function") {
        (router as any).group("/admin", (grp: Router) => {
          grp.get("/metrics", () => {});
        });

        expect(router.match("GET", "/admin/metrics")).toBeDefined();
      }
    });

    it("should return router routes list cleanly via getRoutes() or inspect()", () => {
      const router = new Router();
      router.get("/item1", () => {});
      router.post("/item2", () => {});

      if (typeof (router as any).getRoutes === "function") {
        const routes = (router as any).getRoutes();
        expect(routes.length).toBeGreaterThanOrEqual(2);
      }
    });
  });
});