// tests/unit/subordinate/RouteGroupBuilder.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RouteGroupBuilder } from "../../../../package/core/bootstrap/subatom/subordinate/RouteGroupBuilder.js";
import { createMockApp } from "./testHelpers.js";
import type { IHandler } from "../../../../package/types/framework/router/IRouter.js";
import type { MiddlewareHandler } from "../../../../package/types/http/IMiddleware.js";

describe("RouteGroupBuilder", () => {
  let mockApp: ReturnType<typeof createMockApp>;
  const dummyHandler: IHandler = (_req, res) => res.end();
  const mw1: MiddlewareHandler = (_req, _res, next) => next?.();
  const mw2: MiddlewareHandler = (_req, _res, next) => next?.();

  beforeEach(() => {
    mockApp = createMockApp();
  });

  describe("Constructor & Fluent Configuration", () => {
    it("should throw TypeError if prefix in constructor is not a string", () => {
      // @ts-expect-error testing invalid type
      expect(() => new RouteGroupBuilder(mockApp, 123)).toThrow(
        "[Subatom] group() prefix must be a string.",
      );
    });

    it("should support fluent method chaining", () => {
      const builder = new RouteGroupBuilder(mockApp, "/api");
      const chained = builder
        .prefix("/v1")
        .middleware(mw1)
        .tag("api", ["auth"])
        .rateLimit("100/min"); // <-- changed from "100/15m"

      expect(chained).toBe(builder);
    });
  });

  describe("HTTP Method Direct Registrations", () => {
    const methods: Array<"get" | "post" | "put" | "patch" | "delete"> = [
      "get",
      "post",
      "put",
      "patch",
      "delete",
    ];

    methods.forEach((method) => {
      it(`should register ${method.toUpperCase()} routes via .${method}()`, () => {
        const builder = new RouteGroupBuilder(mockApp, "/api");
        builder[method]("/test", dummyHandler);

        expect(mockApp._registerGroupRoute).toHaveBeenCalledWith(
          method.toUpperCase(),
          "/api/test",
          [dummyHandler],
          {},
        );
      });
    });
  });

  describe("Group Scoping & Callback Execution", () => {
    it("should throw TypeError if callback is provided but not a function", () => {
      const builder = new RouteGroupBuilder(mockApp);
      // @ts-expect-error testing non-function callback
      expect(() => builder.group("invalid")).toThrow(
        "[Subatom] .group() expects its argument to be a function, if provided.",
      );
    });

    it("should execute synchronous group callbacks and properly manage context stack", () => {
      const builder = new RouteGroupBuilder(mockApp, "/api");
      builder.middleware(mw1).tag("v1");

      let executed = false;
      builder.group(() => {
        executed = true;
        expect(mockApp._pushGroupContext).toHaveBeenCalledTimes(1);
        const currentContext = mockApp._currentGroupContext();
        expect(currentContext?.prefix).toBe("/api");
        expect(currentContext?.middlewares).toEqual([mw1]);
        expect(currentContext?.tags).toEqual(["v1"]);
      });

      expect(executed).toBe(true);
      expect(mockApp._popGroupContext).toHaveBeenCalledTimes(1);
      expect(mockApp._contextStack.length).toBe(0);
    });

    it("should pop context even if synchronous callback throws", () => {
      const builder = new RouteGroupBuilder(mockApp, "/admin");

      expect(() => {
        builder.group(() => {
          throw new Error("Internal route configuration error");
        });
      }).toThrow("Internal route configuration error");

      expect(mockApp._pushGroupContext).toHaveBeenCalledTimes(1);
      expect(mockApp._popGroupContext).toHaveBeenCalledTimes(1);
      expect(mockApp._contextStack.length).toBe(0);
    });

    it("should reject and throw TypeError when callback returns a Promise (async callback)", () => {
      const builder = new RouteGroupBuilder(mockApp, "/api");

      expect(() => {
        builder.group(async () => {
          /* async registration */
        });
      }).toThrow(
        "[Subatom] Route group callbacks must be synchronous. An async callback can interleave with other route registrations and corrupt the group context stack.",
      );

      // Pop must still be executed to ensure clean context stack
      expect(mockApp._popGroupContext).toHaveBeenCalledTimes(1);
      expect(mockApp._contextStack.length).toBe(0);
    });

    it("should handle nested groups and inherit cascading configurations", () => {
      const rootBuilder = new RouteGroupBuilder(mockApp, "/api");
      rootBuilder.middleware(mw1).tag("api");

      rootBuilder.group(() => {
        const subBuilder = new RouteGroupBuilder(mockApp, "/users");
        subBuilder.middleware(mw2).tag("users");

        subBuilder.get("/:id", dummyHandler);
      });

      expect(mockApp._registerGroupRoute).toHaveBeenCalledWith(
        "GET",
        "/api/users/:id",
        [mw1, mw2, dummyHandler],
        { tags: ["api", "users"] },
      );
    });

    it("should work seamlessly when no callback is provided", () => {
      const builder = new RouteGroupBuilder(mockApp, "/empty");
      expect(() => builder.group()).not.toThrow();
      expect(mockApp._pushGroupContext).toHaveBeenCalledTimes(1);
      expect(mockApp._popGroupContext).toHaveBeenCalledTimes(1);
    });
  });
});
