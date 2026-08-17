import { describe, expect, it } from "vitest";
import isRouterInstance from "../../../../package/core/router/helpers/isRouterInstance.js";
import { Router } from "../../../../package/core/router/Router.js";

describe("Unit: isRouterInstance", () => {
	it("should return true for an instance of Router", () => {
		const router = new Router();
		expect(isRouterInstance(router)).toBe(true);
	});

	it("should return true for a duck-typed object matching IRouter and Router contract", () => {
		const duckRouter = {
			getRoutes: () => [],
			dispatch: async () => {},
		};
		expect(isRouterInstance(duckRouter)).toBe(true);
	});

	it("should return false for primitives, null, undefined, and functions", () => {
		expect(isRouterInstance(null)).toBe(false);
		expect(isRouterInstance(undefined)).toBe(false);
		expect(isRouterInstance("router")).toBe(false);
		expect(isRouterInstance(123)).toBe(false);
		expect(isRouterInstance(() => {})).toBe(false);
		expect(isRouterInstance({})).toBe(false);
	});

	it("should return false when getRoutes or dispatch is missing", () => {
		expect(isRouterInstance({ getRoutes: () => [] })).toBe(false);
		expect(isRouterInstance({ dispatch: async () => {} })).toBe(false);
	});
});
