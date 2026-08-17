// tests/unit/subordinate/services/contextBuilder.service.test.ts
import { describe, it, expect } from "vitest";
import { buildGroupContext } from "../../../../package/core/bootstrap/subatom/subordinate/services/contextBuilder.service.js";
import type { IGroupContext } from "../../../../package/types/framework/core/IFrameworkCore.js";
import type { MiddlewareHandler } from "../../../../package/types/http/IMiddleware.js";

describe("contextBuilder.service - buildGroupContext", () => {
    const fn1: MiddlewareHandler = (_req, _res, next) => next?.();
    const fn2: MiddlewareHandler = (_req, _res, next) => next?.();
    const rlMiddleware1: MiddlewareHandler = (_req, _res, next) => next?.();
    const rlMiddleware2: MiddlewareHandler = (_req, _res, next) => next?.();

    it("should construct root context without parent", () => {
        const ctx = buildGroupContext(
            undefined,
            "/api",
            [fn1],
            ["core"],
            "60/1m",
            rlMiddleware1,
        );

        expect(ctx.prefix).toBe("/api");
        expect(ctx.middlewares).toEqual([fn1]);
        expect(ctx.tags).toEqual(["core"]);
        expect(ctx.rateLimitSpec).toBe("60/1m");
        expect(ctx.rateLimitMiddleware).toBe(rlMiddleware1);
    });

    it("should correctly inherit and merge parent prefixes, middlewares, and tags", () => {
        const parentContext: IGroupContext = {
            prefix: "/api/v1",
            middlewares: [fn1],
            tags: ["api"],
            rateLimitSpec: "100/1m",
            rateLimitMiddleware: rlMiddleware1,
        };

        const childCtx = buildGroupContext(
            parentContext,
            "/users",
            [fn2],
            ["users"],
        );

        expect(childCtx.prefix).toBe("/api/v1/users");
        expect(childCtx.middlewares).toEqual([fn1, fn2]);
        expect(childCtx.tags).toEqual(["api", "users"]);
        // Inherits parent rate-limit when child does not specify
        expect(childCtx.rateLimitSpec).toBe("100/1m");
        expect(childCtx.rateLimitMiddleware).toBe(rlMiddleware1);
    });

    it("should override parent rate-limit config when child provides own rate-limit", () => {
        const parentContext: IGroupContext = {
            prefix: "/api",
            middlewares: [],
            tags: [],
            rateLimitSpec: "100/1m",
            rateLimitMiddleware: rlMiddleware1,
        };

        const childCtx = buildGroupContext(
            parentContext,
            "/restricted",
            [],
            [],
            "5/1m",
            rlMiddleware2,
        );

        expect(childCtx.rateLimitSpec).toBe("5/1m");
        expect(childCtx.rateLimitMiddleware).toBe(rlMiddleware2);
    });
});