import { describe, expect, it } from "vitest";
import { buildUrl } from "../../../../package/core/router/helpers/buildUrl.js";

describe("Unit: buildUrl", () => {
	it("should return unchanged path when no params or query exist", () => {
		expect(buildUrl("/users")).toBe("/users");
		expect(buildUrl("/")).toBe("/");
	});

	it("should substitute single and multiple path parameters", () => {
		expect(buildUrl("/users/:id", { id: "42" })).toBe("/users/42");
		expect(buildUrl("/users/:id/posts/:postId", { id: 10, postId: 99 })).toBe(
			"/users/10/posts/99",
		);
	});

	it("should properly URI encode substituted parameter values", () => {
		expect(buildUrl("/search/:term", { term: "hello world&foo=bar" })).toBe(
			"/search/hello%20world%26foo%3Dbar",
		);
	});

	it("should append query parameters when provided", () => {
		const url = buildUrl("/users", {}, { page: 1, limit: 10, active: true });
		expect(url).toBe("/users?page=1&limit=10&active=true");
	});

	it("should substitute path params and append query params together", () => {
		const url = buildUrl("/users/:id", { id: "admin" }, { sort: "desc" });
		expect(url).toBe("/users/admin?sort=desc");
	});

	it("should ignore empty query object", () => {
		expect(buildUrl("/users", {}, {})).toBe("/users");
	});

	it("should throw an error when a required path parameter is missing", () => {
		expect(() => buildUrl("/users/:id", {})).toThrowError(
			'[Subatom] urlFor: missing required param ":id" for route "/users/:id".',
		);
	});

	it("should throw an error when parameter value is null, undefined or empty string", () => {
		expect(() =>
			buildUrl("/users/:id", { id: null as unknown as string }),
		).toThrowError(
			'[Subatom] urlFor: missing required param ":id" for route "/users/:id".',
		);
		expect(() =>
			buildUrl("/users/:id", { id: undefined as unknown as string }),
		).toThrowError(
			'[Subatom] urlFor: missing required param ":id" for route "/users/:id".',
		);
		expect(() => buildUrl("/users/:id", { id: "" })).toThrowError(
			'[Subatom] urlFor: missing required param ":id" for route "/users/:id".',
		);
	});

	it("should throw an error when extraneous params not in the route path are supplied", () => {
		expect(() =>
			buildUrl("/users/:id", { id: "123", extra: "val" }),
		).toThrowError(
			'[Subatom] urlFor: received param(s) not present in route "/users/:id": extra.',
		);
	});
});
