import { describe, it, expect } from "vitest";
import { matchPath } from "../../../../../packages/core/router/services/pathMatch.service.js";

describe("matchPath", () => {
	it("should match static routes exactly", () => {
		expect(matchPath("/users/profile", "/users/profile")).toEqual({});
		expect(matchPath("/users/profile", "/users/settings")).toBeNull();
	});

	it("should extract dynamic path parameters", () => {
		expect(matchPath("/users/:id", "/users/42")).toEqual({ id: "42" });
		expect(
			matchPath("/posts/:category/:slug", "/posts/tech/subatom-v1"),
		).toEqual({
			category: "tech",
			slug: "subatom-v1",
		});
	});

	it("should return null when incoming path has more segments than non-prefix route", () => {
		expect(matchPath("/users", "/users/profile/details")).toBeNull();
	});

	it("should return null when a required segment is missing", () => {
		expect(matchPath("/users/:id", "/users")).toBeNull();
	});

	it("should match optional parameters followed by subsequent path check", () => {
		expect(matchPath("/users/:subgroup?/:id", "/users/admin/42")).toEqual({
			subgroup: "admin",
			id: "42",
		});
		expect(matchPath("/categories/:name?", "/categories")).toEqual({});
	});

	it("should continue matching when optional parameter is omitted at the end of the route", () => {
		expect(matchPath("/users/:id?", "/users")).toEqual({});
	});

	it("should decode URI encoded parameters properly", () => {
		expect(matchPath("/search/:query", "/search/hello%20world")).toEqual({
			query: "hello world",
		});
	});

	it("should return null on URI malformed parameters", () => {
		expect(matchPath("/search/:query", "/search/%E0%A4%A")).toBeNull();
	});

	it("should match optional parameters when present or omitted", () => {
		expect(matchPath("/files/:path?", "/files/doc.pdf")).toEqual({
			path: "doc.pdf",
		});
		expect(matchPath("/files/:path?", "/files")).toEqual({});
	});

	it("should return null when static route has more segments than target path", () => {
		expect(matchPath("/users/profile/details", "/users/profile")).toBeNull();
	});

	it("should match prefixes when prefix option is enabled", () => {
		expect(matchPath("/api", "/api/v1/users", { prefix: true })).toEqual({});
		expect(matchPath("/api/v1", "/api", { prefix: true })).toBeNull();
	});
});
