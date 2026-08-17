import { describe, it, expect } from "vitest";
import { extractPathname, extractQuery } from "../../../../package/core/router/services/urlParser.service.js";

describe("Unit: urlParser.service", () => {
    describe("extractPathname", () => {
        it("should extract path before query parameter delimiter", () => {
            expect(extractPathname("/users?page=1")).toBe("/users");
            expect(extractPathname("/api/v1/items?search=vitest&limit=10")).toBe("/api/v1/items");
        });

        it("should return raw path if no query string present", () => {
            expect(extractPathname("/posts/42")).toBe("/posts/42");
            expect(extractPathname("")).toBe("/");
        });
    });

    describe("extractQuery", () => {
        it("should parse query string into key-value map", () => {
            expect(extractQuery("/search?q=subatom&page=2")).toEqual({
                q: "subatom",
                page: "2",
            });
        });

        it("should return empty object when no query string exists", () => {
            expect(extractQuery("/search")).toEqual({});
            expect(extractQuery("/search?")).toEqual({});
        });
    });
});