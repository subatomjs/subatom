import { describe, it, expect } from "vitest";
import { buildUrl } from "../../../../../packages/core/router/helpers/buildUrl.js";

describe("buildUrl", () => {
	it("should return the exact path when no parameters or query are provided", () => {
		expect(buildUrl("/users/list")).toBe("/users/list");
	});

	it("should replace route parameters with encoded values", () => {
		const result = buildUrl("/users/:id/posts/:slug", {
			id: "123",
			slug: "hello world",
		});
		expect(result).toBe("/users/123/posts/hello%20world");
	});

	it("should allow numeric parameter values", () => {
		const result = buildUrl("/items/:id", { id: 42 });
		expect(result).toBe("/items/42");
	});

	it("should throw when a required parameter is missing", () => {
		expect(() => buildUrl("/users/:id", {})).toThrowError(
			'[Subatom] urlFor: missing required param ":id" for route "/users/:id".',
		);
	});

	it("should throw when a required parameter is an empty string", () => {
		expect(() => buildUrl("/users/:id", { id: "" })).toThrowError(
			'[Subatom] urlFor: missing required param ":id" for route "/users/:id".',
		);
	});

	it("should throw when extra parameters are supplied", () => {
		expect(() =>
			buildUrl("/users/:id", { id: "1", extra: "val", unused: 2 }),
		).toThrowError(
			'[Subatom] urlFor: received param(s) not present in route "/users/:id": extra, unused.',
		);
	});

	it("should append query string correctly", () => {
		const result = buildUrl(
			"/search",
			{},
			{ q: "subatom", page: 1, active: true },
		);
		expect(result).toBe("/search?q=subatom&page=1&active=true");
	});

	it("should ignore empty query objects", () => {
		const result = buildUrl("/search", {}, {});
		expect(result).toBe("/search");
	});
});
