// subatom/package/core/bootstrap/subatom/helpers/__tests__/combinePath.spec.ts

import { describe, it, expect } from "vitest";
import { combinePaths } from "../../../../package/core/bootstrap/subatom/helpers/combinePath.js";

describe("combinePaths", () => {
  describe("Default & Empty State Behavior", () => {
    it('returns "/" when called with no arguments', () => {
      expect(combinePaths()).toBe("/");
    });

    it('returns "/" when all inputs are empty, null, or undefined', () => {
      expect(combinePaths("")).toBe("/");
      expect(combinePaths(null)).toBe("/");
      expect(combinePaths(undefined)).toBe("/");
      expect(combinePaths("", null, undefined, "   ")).toBe("/");
    });

    it('returns "/" for root slash variations', () => {
      expect(combinePaths("/")).toBe("/");
      expect(combinePaths("/", "/", "///")).toBe("/");
    });
  });

  describe("Standard Segment Joining", () => {
    it("joins simple segments correctly with single leading slashes", () => {
      expect(combinePaths("api", "v1", "users")).toBe("/api/v1/users");
      expect(combinePaths("/api", "/v1", "/users")).toBe("/api/v1/users");
    });

    it("handles mixed leading and trailing slashes seamlessly", () => {
      expect(combinePaths("api/", "/v1/", "users/")).toBe("/api/v1/users");
      expect(combinePaths("/api/", "/v1/", "/users/")).toBe("/api/v1/users");
    });

    it("preserves single-segment inputs with a normalized leading slash", () => {
      expect(combinePaths("dashboard")).toBe("/dashboard");
      expect(combinePaths("/dashboard")).toBe("/dashboard");
      expect(combinePaths("dashboard/")).toBe("/dashboard");
      expect(combinePaths("/dashboard/")).toBe("/dashboard");
    });
  });

  describe("Slash Deduplication & Normalization", () => {
    it("collapses multiple consecutive internal and external slashes", () => {
      expect(combinePaths("///api///", "///v1///", "///users///")).toBe(
        "/api/v1/users",
      );
      expect(combinePaths("api//sub-path", "//details//")).toBe(
        "/api/sub-path/details",
      );
    });

    it("handles segments containing nested paths", () => {
      expect(combinePaths("org/team", "project/repo")).toBe(
        "/org/team/project/repo",
      );
      expect(combinePaths("/org//team/", "/project///repo/")).toBe(
        "/org/team/project/repo",
      );
    });
  });

  describe("Whitespace & Sanitization", () => {
    it("trims leading and trailing whitespace from segments", () => {
      expect(combinePaths("  api  ", "  v1  ", "  users  ")).toBe(
        "/api/v1/users",
      );
      expect(combinePaths(" /api/ ", " /v1/ ")).toBe("/api/v1");
    });

    it("ignores segments that resolve to pure whitespace or empty after trimming", () => {
      expect(combinePaths("api", "   ", "v1", "", "users")).toBe(
        "/api/v1/users",
      );
      expect(combinePaths("   ", " / ", "  ///  ")).toBe("/");
    });
  });

  describe("Handling Null, Undefined & Incompatible Inputs", () => {
    it("filters out scattered null and undefined segments without breaking sequence", () => {
      expect(
        combinePaths(null, "api", undefined, "v1", null, "users", undefined),
      ).toBe("/api/v1/users");
      expect(combinePaths(undefined, "health")).toBe("/health");
      expect(combinePaths("metrics", null)).toBe("/metrics");
    });

    it("safely handles non-string values passed via type assertions or dynamic runtime data", () => {
      // @ts-expect-error - testing JS runtime resilience
      expect(combinePaths(123, "items", 456)).toBe("/123/items/456");
      // @ts-expect-error - testing boolean coercion safety
      expect(combinePaths(true, "flag")).toBe("/true/flag");
    });
  });

  describe("URL Parameters, Extensions & Query-like Strings", () => {
    it("preserves file extensions and path parameters", () => {
      expect(combinePaths("static", "bundle.min.js")).toBe(
        "/static/bundle.min.js",
      );
      expect(combinePaths("users", ":id", "profile")).toBe(
        "/users/:id/profile",
      );
    });

    it("handles segment-level query strings or hashes without stripping them", () => {
      expect(combinePaths("api", "search?query=test")).toBe(
        "/api/search?query=test",
      );
      expect(combinePaths("docs", "intro#section-1")).toBe(
        "/docs/intro#section-1",
      );
    });
  });

  describe("Property-Based / Fuzzing Scenarios", () => {
    it('never produces trailing slashes (except for root "/") or duplicate consecutive slashes', () => {
      const dirtySegments = [
        "//",
        "///",
        "   ",
        "",
        null,
        undefined,
        "/a/",
        "//b//",
        " c ",
        "/d/e/",
        "f//g//",
      ];

      const result = combinePaths(...dirtySegments);

      expect(result).toBe("/a/b/c/d/e/f/g");
      expect(result.startsWith("/")).toBe(true);
      expect(result.endsWith("/")).toBe(false);
      expect(result.includes("//")).toBe(false);
    });
  });
});
