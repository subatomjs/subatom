import { describe, it, expect, vi } from "vitest";
import { buildResourceRoutes } from "../../../../../packages/core/router/helpers/resourceRouteBuilder.js";
import type { IResourceController } from "../../../../../packages/core/router/types/resource.router.types.js";
import type { IHandler } from "../../../../../packages/core/router/types/router.types.js";

describe("buildResourceRoutes", () => {
  const dummyController: IResourceController = {
    index: () => "index",
    show: () => "show",
    create: () => "create",
    update: () => "update",
    delete: () => "delete",
  };

  it("should build default plural routes including automatic PATCH alias for update", () => {
    const routes = buildResourceRoutes("photos", dummyController);

    const methodsAndPaths = routes.map((r) => ({
      method: r.method,
      path: r.path,
      name: r.meta?.name,
    }));

    expect(methodsAndPaths).toEqual([
      { method: "GET", path: "/photos", name: "photos.index" },
      { method: "POST", path: "/photos", name: "photos.create" },
      { method: "GET", path: "/photos/:id", name: "photos.show" },
      { method: "PUT", path: "/photos/:id", name: "photos.update" },
      { method: "PATCH", path: "/photos/:id", name: "photos.patch" },
      { method: "DELETE", path: "/photos/:id", name: "photos.delete" },
    ]);
  });

  it("should respect singular resource option", () => {
    const routes = buildResourceRoutes("profile", dummyController, {
      singular: true,
    });

    const paths = routes.map((r) => `${r.method} ${r.path}`);
    expect(paths).toContain("GET /profile");
    expect(paths).not.toContain("GET /profile/:id");
  });

  it("should build root resource paths and root-based names", () => {
    const routes = buildResourceRoutes("/", {
      index: () => "index",
      create: () => "create",
    });

    expect(routes.map((route) => route.path)).toEqual(["/", "/"]);
    expect(routes.map((route) => route.meta?.name)).toEqual([
      "root.index",
      "root.create",
    ]);
  });

  it("should honor custom param option", () => {
    const routes = buildResourceRoutes("users", dummyController, {
      param: "userId",
    });

    const showRoute = routes.find((r) => r.meta?.name === "users.show");
    expect(showRoute?.path).toBe("/users/:userId");
    expect(showRoute?.meta?.schema).toEqual({
      params: { userId: { type: "string" } },
    });
  });

  it("should filter actions using 'only'", () => {
    const routes = buildResourceRoutes("posts", dummyController, {
      only: ["index", "show"],
    });
    expect(routes.map((r) => r.meta?.name)).toEqual([
      "posts.index",
      "posts.show",
    ]);
  });

  it("should filter actions using 'except'", () => {
    const routes = buildResourceRoutes("posts", dummyController, {
      except: ["create", "delete", "destroy"],
      allowPatch: false,
    });
    expect(routes.map((r) => r.meta?.name)).toEqual([
      "posts.index",
      "posts.show",
      "posts.update",
    ]);
  });

  it("should throw when both 'only' and 'except' are provided", () => {
    expect(() =>
      buildResourceRoutes("posts", dummyController, {
        only: ["index"],
        except: ["show"],
      }),
    ).toThrowError(/mutually exclusive/);
  });

  it("should throw when invalid param contains colons or slashes", () => {
    expect(() =>
      buildResourceRoutes("posts", dummyController, { param: "user:id" }),
    ).toThrowError(/invalid param name/);
  });

  it("should throw if 'only' references an action not in the controller", () => {
    expect(() =>
      buildResourceRoutes("posts", { index: () => {} }, { only: ["destroy"] }),
    ).toThrowError(/'only' requested action\(s\) not implemented: destroy/);
  });

  it("should reject invalid resource definitions and unknown only actions", () => {
    expect(() => buildResourceRoutes("", dummyController)).toThrowError(/basePath/);
    expect(() => buildResourceRoutes("posts", null as unknown as IResourceController)).toThrowError(/controller object/);
    expect(() => buildResourceRoutes("posts", dummyController, { only: ["destroy", "index"] })).toThrowError(/not implemented/);
    expect(() => buildResourceRoutes("profile", dummyController, { only: ["invalid" as never] })).toThrowError(/not valid/);
    expect(() => buildResourceRoutes("posts", dummyController, { param: "user/id" })).toThrowError(/invalid param name/);
  });

  it("should apply names, tags, rate limits, schemas, middleware, and array handlers", () => {
    const middleware = vi.fn<IHandler>();
    const firstHandler = vi.fn<IHandler>();
    const controller = {
      update: [firstHandler, () => ({ updated: true })],
    } satisfies IResourceController;

    const routes = buildResourceRoutes("/admin/posts/", controller, {
      middleware: [middleware],
      namePrefix: "admin.posts",
      names: { update: "post.update" },
      tags: ["admin"],
      rateLimit: "5/minute",
      schemas: { update: { body: { type: "object" } } },
    });

    expect(routes).toHaveLength(2);
    expect(routes[0]?.handlers).toHaveLength(3);
    expect(routes[0]?.meta).toEqual({
      name: "post.update",
      tags: ["admin"],
      rateLimit: "5/minute",
      schema: { body: { type: "object" } },
    });
    expect(routes[1]?.method).toBe("PATCH");
    expect(routes[1]?.meta?.name).toBe("admin.posts.patch");
  });

  it("should apply singular schema to params, respect singular custom param, and cover action schema inheritance", () => {
    const singularController: IResourceController = {
      show: () => "show-singular",
      update: () => "update-singular",
    };

    const routes = buildResourceRoutes("profile", singularController, {
      singular: false,
      param: "profileId",
      schemas: {
        show: {
          query: { type: "object" },
        },
      },
    });

    const showRoute = routes.find((r) => r.meta?.name === "profile.show");
    expect(showRoute?.path).toBe("/profile/:profileId");
    expect(showRoute?.meta?.schema).toEqual({
      query: { type: "object" },
    });
  });

  it("should skip missing actions and preserve explicit patch handlers", () => {
    const controller = {
      update: () => "update",
      patch: () => "patch",
    } satisfies IResourceController;

    const routes = buildResourceRoutes("posts", controller, { allowPatch: false });

    expect(routes.map((route) => route.method)).toEqual(["PUT", "PATCH"]);
    expect(routes.every((route) => route.path === "/posts/:id")).toBe(true);
  });

  it("should auto-serialize objects via ctx.json and skip serialization when response already ended", async () => {
    const controller: IResourceController = {
      index: () => ({ success: true }),
      show: (ctx: any) => {
        ctx.res.writableEnded = true;
        return { shouldNotSend: true };
      },
    };

    const routes = buildResourceRoutes("/api/json", controller);
    const dummyReq = { raw: {} } as unknown as Parameters<IHandler>[0];
    const dummyRes = {
      writableEnded: false,
      headersSent: false,
      raw: {},
      send: vi.fn(),
      json: vi.fn(),
    } as unknown as Parameters<IHandler>[1];
    const next = vi.fn();

    const indexHandler = routes.find((r) => r.method === "GET" && r.path === "/api/json")?.handlers[0];
    if (indexHandler) await indexHandler(dummyReq, dummyRes, next);
    expect((dummyRes as unknown as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith({ success: true });

    const showHandler = routes.find((r) => r.method === "GET" && r.path === "/api/json/:id")?.handlers[0];
    if (showHandler) await showHandler(dummyReq, dummyRes, next);
    expect(next).not.toHaveBeenCalled();
  });

  it("should bypass controller execution if res.writableEnded is true initially", async () => {
    const controllerFn = vi.fn();
    const controller = {
      index: controllerFn,
    };

    const routes = buildResourceRoutes("/bypass", controller);
    const dummyReq = { raw: {} } as unknown as Parameters<IHandler>[0];
    const dummyRes = {
      writableEnded: true,
      headersSent: false,
      raw: {},
    } as unknown as Parameters<IHandler>[1];
    const next = vi.fn();

    const handler = routes[0]?.handlers[0];
    if (handler) await handler(dummyReq, dummyRes, next);

    expect(controllerFn).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("should not call ctx.json or ctx.send when controller returns undefined", async () => {
    const controller = {
      index: () => undefined,
    };

    const routes = buildResourceRoutes("/void", controller);
    const dummyReq = { raw: {} } as unknown as Parameters<IHandler>[0];
    const dummyRes = {
      writableEnded: false,
      headersSent: false,
      raw: {},
      send: vi.fn(),
      json: vi.fn(),
    } as unknown as Parameters<IHandler>[1];
    const next = vi.fn();

    const handler = routes[0]?.handlers[0];
    if (handler) await handler(dummyReq, dummyRes, next);

    expect(dummyRes.send).not.toHaveBeenCalled();
    expect(dummyRes.json).not.toHaveBeenCalled();
  });

  it("should normalize resource middleware based on handler arity", async () => {
    const legacyMw = vi.fn((_req, _res, next) => next());
    const contextMw = vi.fn((_ctx, next) => next());

    const controller: IResourceController = {
      index: () => "ok",
    };

    const routes = buildResourceRoutes("/middleware-test", controller, {
      middleware: [legacyMw, contextMw],
    });

    const dummyReq = { raw: {} } as unknown as Parameters<IHandler>[0];
    const dummyRes = {
      writableEnded: false,
      headersSent: false,
      raw: {},
      send: vi.fn(),
      json: vi.fn(),
    } as unknown as Parameters<IHandler>[1];
    const next = vi.fn();

    const handlers = routes[0]?.handlers ?? [];
    expect(handlers.length).toBe(3);

    await handlers[0]?.(dummyReq, dummyRes, next);
    expect(legacyMw).toHaveBeenCalled();

    await handlers[1]?.(dummyReq, dummyRes, next);
    expect(contextMw).toHaveBeenCalled();
  });

  it("should handle controllers returning Buffers, Uint8Arrays, and custom primitives", async () => {
    const bufferData = Buffer.from("subatom");
    const uintData = new Uint8Array([1, 2, 3]);

    const controller: IResourceController = {
      index: () => bufferData,
      show: () => uintData,
      create: () => 404,
      update: () => true,
    };

    const routes = buildResourceRoutes("/media", controller);
    expect(routes).toHaveLength(5);

    const dummyReq = { raw: {} } as unknown as Parameters<IHandler>[0];
    const dummyRes = {
      writableEnded: false,
      headersSent: false,
      raw: {},
      send: vi.fn(),
      json: vi.fn(),
    } as unknown as Parameters<IHandler>[1];
    const next = vi.fn();

    const indexHandler = routes.find((r) => r.method === "GET" && r.path === "/media")?.handlers[0];
    if (indexHandler) await indexHandler(dummyReq, dummyRes, next);
    expect(next).not.toHaveBeenCalled();

    const createHandler = routes.find((r) => r.method === "POST")?.handlers[0];
    if (createHandler) await createHandler(dummyReq, dummyRes, next);
    expect(next).not.toHaveBeenCalled();
    expect((dummyRes as unknown as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith("404");
  });

  it("should forward controller thrown exceptions to next()", async () => {
    const controller: IResourceController = {
      index: () => {
        throw new Error("Action failed");
      },
    };

    const routes = buildResourceRoutes("/errors", controller);
    const handler = routes[0]?.handlers[0];

    const dummyReq = { raw: {} } as unknown as Parameters<IHandler>[0];
    const dummyRes = { writableEnded: false, raw: {} } as unknown as Parameters<IHandler>[1];
    const next = vi.fn();

    if (handler) await handler(dummyReq, dummyRes, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it("should throw TypeError when action handler list is empty or contains non-functions", () => {
    const invalidEmpty = {
      index: [] as unknown as NonNullable<IResourceController["index"]>,
    } as unknown as IResourceController;

    expect(() => buildResourceRoutes("/test", invalidEmpty)).toThrowError(
      /has an empty handler array/,
    );

    const invalidType = {
      index: [null as unknown as () => void],
    } as unknown as IResourceController;

    expect(() => buildResourceRoutes("/test", invalidType)).toThrowError(
      /must contain only functions/,
    );
  });
});