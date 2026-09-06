import { describe, expect, it } from "vitest";
import { normalizeHandlers } from "../../../../../packages/core/router/helpers/normalizeHandlers.js";

describe("normalizeHandlers", () => {
  const firstHandler = () => undefined;
  const secondHandler = () => undefined;

  it("should normalize a single handler", () => {
    expect(normalizeHandlers(firstHandler, "/users", "index")).toEqual([
      firstHandler,
    ]);
  });

  it("should preserve an array of handlers", () => {
    expect(
      normalizeHandlers([firstHandler, secondHandler], "/users", "show"),
    ).toEqual([firstHandler, secondHandler]);
  });

  it("should reject nested handler arrays", () => {
    expect(() =>
      normalizeHandlers([[firstHandler]] as never, "/users", "update"),
    ).toThrow(/must be a function/);
  });

  it("should reject an empty handler array", () => {
    expect(() => normalizeHandlers([], "/users", "index")).toThrow(
      /empty handler array/,
    );
  });

  it("should reject non-function handlers", () => {
    expect(() =>
      normalizeHandlers("invalid" as never, "/users", "index"),
    ).toThrow(/must be a function/);
  });
});
