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

  it("should skip missing actions and preserve explicit patch handlers", () => {
    const controller = {
      update: () => "update",
      patch: () => "patch",
    } satisfies IResourceController;

    const routes = buildResourceRoutes("posts", controller, { allowPatch: false });

    expect(routes.map((route) => route.method)).toEqual(["PUT", "PATCH"]);
    expect(routes.every((route) => route.path === "/posts/:id")).toBe(true);
  });
});