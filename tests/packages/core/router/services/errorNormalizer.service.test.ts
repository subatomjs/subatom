import { describe, expect, it } from "vitest";
import { SubatomError } from "../../../../../packages/errors/Errors.js";
import { normalizeError } from "../../../../../packages/core/router/services/errorNormalizer.service.js";

describe("normalizeError", () => {
  it("should return an existing Error unchanged", () => {
    const error = new Error("failed");

    expect(normalizeError(error)).toBe(error);
  });

  it("should wrap primitive exceptions in a SubatomError", () => {
    const normalized = normalizeError("failed");

    expect(normalized).toBeInstanceOf(SubatomError);
    expect(normalized.message).toBe("failed");
  });

  it("should preserve non-Error details when wrapping objects", () => {
    const details = { reason: "failed", statusCode: 503 };
    const normalized = normalizeError(details) as SubatomError;

    expect(normalized).toBeInstanceOf(SubatomError);
    expect(normalized.details).toBe(details);
  });

  it("should preserve Error instances that already have a status code", () => {
    const error = Object.assign(new Error("unavailable"), { statusCode: 503 });

    expect(normalizeError(error)).toBe(error);
    expect((normalizeError(error) as Error & { statusCode: number }).statusCode).toBe(503);
  });
});
