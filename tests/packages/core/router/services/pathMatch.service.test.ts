import { describe, it, expect } from "vitest";
import { matchPath } from "../../../../../packages/core/router/services/pathMatch.service.js";

describe("matchPath", () => {
  it("should match static routes exactly", () => {
    expect(matchPath("/users/profile", "/users/profile")).toEqual({});
    expect(matchPath("/users/profile", "/users/settings")).toBeNull();
  });

  it("should extract dynamic path parameters", () => {
    expect(matchPath("/users/:id", "/users/42")).toEqual({ id: "42" });
    expect(matchPath("/posts/:category/:slug", "/posts/tech/subatom-v1")).toEqual({
      category: "tech",
      slug: "subatom-v1",
    });
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

  it("should match prefixes when prefix option is enabled", () => {
    expect(
      matchPath("/api", "/api/v1/users", { prefix: true }),
    ).toEqual({});
    expect(
      matchPath("/api/v1", "/api", { prefix: true }),
    ).toBeNull();
  });
});