import { describe, it, expect } from "vitest";
import { matchPath } from "../../../../package/core/router/services/pathMatcher.service.js";

describe("Unit: pathMatcher.service", () => {
    it("should match static exact paths", () => {
        expect(matchPath("/users/list", "/users/list")).toEqual({});
        expect(matchPath("/", "/")).toEqual({});
        expect(matchPath("/users", "/posts")).toBeNull();
    });

    it("should extract route parameters and decode URI segments", () => {
        const res = matchPath("/users/:id/posts/:slug", "/users/100/posts/hello%20world");
        expect(res).toEqual({
            id: "100",
            slug: "hello world",
        });
    });

    it("should return null if segment count does not match in non-prefix mode", () => {
        expect(matchPath("/users", "/users/123")).toBeNull();
        expect(matchPath("/users/profile", "/users")).toBeNull();
    });

    it("should support prefix matching when options.prefix is true", () => {
        expect(matchPath("/api", "/api/v1/users", { prefix: true })).toEqual({});
        expect(matchPath("/org/:orgId", "/org/subatom/repo/123", { prefix: true })).toEqual({
            orgId: "subatom",
        });
        expect(matchPath("/api/v2", "/api", { prefix: true })).toBeNull();
    });

    it("should return null if URI malformed in param decode", () => {
        expect(matchPath("/users/:id", "/users/%E0%A4%A")).toBeNull();
    });

    it("should return null if param segment is just ':' with no key name", () => {
        expect(matchPath("/users/:", "/users/123")).toBeNull();
    });
});