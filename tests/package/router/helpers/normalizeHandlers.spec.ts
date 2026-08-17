import { describe, expect, it } from "vitest";

import { normalizeHandlers } from "../../../../package/core/router/helpers/normalizeHandlers.js";
import type { IHandler } from "../../../../package/types/framework/router/IRouter.js";

describe("Unit: normalizeHandlers", () => {
	const fn1: IHandler = (_req, _res, next) => next();
	const fn2: IHandler = (_req, _res, next) => next();

	it("should wrap a single function handler in an array", () => {
		const result = normalizeHandlers(fn1, "/posts", "show");
		expect(result).toEqual([fn1]);
	});

	it("should preserve an array of valid handler functions", () => {
		const result = normalizeHandlers([fn1, fn2], "/posts", "index");
		expect(result).toEqual([fn1, fn2]);
	});

	it("should throw TypeError if handler array is empty", () => {
		expect(() => normalizeHandlers([], "/posts", "destroy")).toThrow(TypeError);
		expect(() => normalizeHandlers([], "/posts", "destroy")).toThrow(
			'[Subatom] router.resource("/posts"): action "destroy" has an empty handler array.',
		);
	});

	it("should throw TypeError if any item is not a function", () => {
		expect(() =>
			normalizeHandlers(
				[fn1, "not-a-fn" as unknown as IHandler],
				"/posts",
				"create",
			),
		).toThrow(
			'[Subatom] router.resource("/posts"): action "create" must be a function or an array of functions.',
		);
	});
});
