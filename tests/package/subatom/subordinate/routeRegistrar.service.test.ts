// tests/unit/subordinate/services/routeRegistrar.service.test.ts
import { describe, expect, it, vi } from "vitest";
import { registerGroupRoute } from "../../../../package/core/bootstrap/subatom/subordinate/services/routeRegistrar.service.js";
import type { IGroupContext } from "../../../../package/types/framework/core/IFrameworkCore.js";
import type { IHandler } from "../../../../package/types/framework/router/IRouter.js";
import { createMockApp } from "./testHelpers.js";

describe("routeRegistrar.service - registerGroupRoute", () => {
	const handler1: IHandler = (_req, res) => res.end();
	const handler2: IHandler = (_req, res) => res.end();
	const middlewareFn = vi.fn();
	const rateLimitFn = vi.fn();

	it("should throw TypeError if route path is invalid or empty", () => {
		const app = createMockApp();
		const ctx: IGroupContext = {
			prefix: "",
			middlewares: [],
			tags: [],
			rateLimitSpec: undefined,
			rateLimitMiddleware: undefined,
		};

		// @ts-expect-error testing invalid type
		expect(() => registerGroupRoute(app, ctx, "GET", null, [handler1])).toThrow(
			"[Subatom] Route path for GET must be a non-empty string.",
		);
		expect(() => registerGroupRoute(app, ctx, "POST", "", [handler1])).toThrow(
			"[Subatom] Route path for POST must be a non-empty string.",
		);
	});

	it("should throw TypeError if handlers array is missing or empty", () => {
		const app = createMockApp();
		const ctx: IGroupContext = {
			prefix: "/api",
			middlewares: [],
			tags: [],
			rateLimitSpec: undefined,
			rateLimitMiddleware: undefined,
		};

		// @ts-expect-error testing invalid type
		expect(() => registerGroupRoute(app, ctx, "GET", "/users", null)).toThrow(
			'[Subatom] Route "GET /users" requires at least one handler function.',
		);
		expect(() => registerGroupRoute(app, ctx, "DELETE", "/users", [])).toThrow(
			'[Subatom] Route "DELETE /users" requires at least one handler function.',
		);
	});

	it("should correctly combine handlers in order: [rateLimit, ...middlewares, ...handlers]", () => {
		const app = createMockApp();
		const ctx: IGroupContext = {
			prefix: "/api",
			middlewares: [middlewareFn as any],
			tags: ["users"],
			rateLimitSpec: "20/1m",
			rateLimitMiddleware: rateLimitFn as any,
		};

		registerGroupRoute(app, ctx, "GET", "/profile", [handler1, handler2]);

		expect(app._registerGroupRoute).toHaveBeenCalledWith(
			"GET",
			"/api/profile",
			[rateLimitFn, middlewareFn, handler1, handler2],
			{
				tags: ["users"],
				rateLimit: "20/1m",
			},
		);
	});

	it("should omit tags and rateLimit from meta when not defined in context", () => {
		const app = createMockApp();
		const ctx: IGroupContext = {
			prefix: "",
			middlewares: [],
			tags: [],
			rateLimitSpec: undefined,
			rateLimitMiddleware: undefined,
		};

		registerGroupRoute(app, ctx, "PUT", "/status", [handler1]);

		expect(app._registerGroupRoute).toHaveBeenCalledWith(
			"PUT",
			"/status",
			[handler1],
			{},
		);
	});
});
