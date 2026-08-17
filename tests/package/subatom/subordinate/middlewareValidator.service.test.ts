// tests/unit/subordinate/services/middlewareValidator.service.test.ts
import { describe, expect, it } from "vitest";
import { collectMiddlewares } from "../../../../package/core/bootstrap/subatom/subordinate/services/middlewareValidator.service.js";
import type { MiddlewareHandler } from "../../../../package/types/http/IMiddleware.js";

describe("middlewareValidator.service - collectMiddlewares", () => {
	const fn1: MiddlewareHandler = (_req, _res, next) => next?.();
	const fn2: MiddlewareHandler = (_req, _res, next) => next?.();
	const fn3: MiddlewareHandler = (_req, _res, next) => next?.();

	it("should collect flat middleware functions", () => {
		const list: MiddlewareHandler[] = [];
		collectMiddlewares(list, fn1, fn2);
		expect(list).toEqual([fn1, fn2]);
	});

	it("should collect array-wrapped middleware functions", () => {
		const list: MiddlewareHandler[] = [];
		collectMiddlewares(list, [fn1, fn2], fn3);
		expect(list).toEqual([fn1, fn2, fn3]);
	});

	it("should throw TypeError if a non-function is passed directly", () => {
		const list: MiddlewareHandler[] = [];
		expect(() =>
			// @ts-expect-error Testing invalid runtime input
			collectMiddlewares(list, "not-a-function"),
		).toThrow(
			new TypeError(
				"[Subatom] .middleware() only accepts functions (or arrays of functions).",
			),
		);
	});

	it("should throw TypeError if a non-function is passed inside an array", () => {
		const list: MiddlewareHandler[] = [];
		expect(() =>
			// @ts-expect-error Testing invalid runtime input in nested array
			collectMiddlewares(list, [fn1, 42]),
		).toThrow(
			new TypeError(
				"[Subatom] .middleware() only accepts functions (or arrays of functions).",
			),
		);
	});
});
