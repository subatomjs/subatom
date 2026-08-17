import { describe, expect, it } from "vitest";
import { matchRoute } from "../../../../package/core/router/services/routeMatcher.service.js";
import type { IRoute } from "../../../../package/types/framework/router/IRouter.js";

describe("Unit: routeMatcher.service", () => {
	const dummyHandler = () => {};
	const routes: IRoute[] = [
		{ method: "USE", path: "/admin", handlers: [dummyHandler] },
		{ method: "GET", path: "/users", handlers: [dummyHandler] },
		{ method: "POST", path: "/users", handlers: [dummyHandler] },
		{ method: "ALL", path: "/wildcard/:id", handlers: [dummyHandler] },
	];

	it("should find exact match for method and path", () => {
		const result = matchRoute(routes, "GET", "/users?sort=asc");
		expect(result).toBeDefined();
		expect(result?.route.path).toBe("/users");
		expect(result?.query).toEqual({ sort: "asc" });
	});

	it("should match ALL wildcard method for any HTTP verb", () => {
		const result = matchRoute(routes, "DELETE", "/wildcard/55");
		expect(result).toBeDefined();
		expect(result?.route.method).toBe("ALL");
		expect(result?.params).toEqual({ id: "55" });
	});

	it("should ignore USE middleware entries during direct route matching", () => {
		const result = matchRoute(routes, "GET", "/admin");
		expect(result).toBeUndefined();
	});

	it("should return undefined if no matching route is found", () => {
		expect(matchRoute(routes, "GET", "/not-found")).toBeUndefined();
		expect(matchRoute(routes, "PUT", "/users")).toBeUndefined();
	});
});
