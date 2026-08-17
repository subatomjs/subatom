// tests/services/acceptsHeader.service.test.ts
import { describe, expect, it } from "vitest";
import { acceptsHeader } from "../../../../package/core/http/request/services/acceptsHeader.service.js";

describe("acceptsHeader service", () => {
  it("should return true when no accept header is present (RFC 7231 default */*)", () => {
    expect(acceptsHeader({}, "application/json")).toBe(true);
  });

  it("should return false when target content type is malformed", () => {
    expect(acceptsHeader({ accept: "*/*" }, "invalid-no-slash")).toBe(false);
  });

  it("should match wildcard */*", () => {
    const headers = { accept: "*/*" };
    expect(acceptsHeader(headers, "application/json")).toBe(true);
    expect(acceptsHeader(headers, "image/png")).toBe(true);
  });

  it("should match subtype wildcard (e.g. image/*)", () => {
    const headers = { accept: "image/*, text/html" };
    expect(acceptsHeader(headers, "image/png")).toBe(true);
    expect(acceptsHeader(headers, "image/webp")).toBe(true);
    expect(acceptsHeader(headers, "application/json")).toBe(false);
  });

  it("should match exact mime types and strip parameters", () => {
    const headers = { accept: "text/html; charset=UTF-8, application/json" };
    expect(acceptsHeader(headers, "text/html")).toBe(true);
    expect(acceptsHeader(headers, "application/json")).toBe(true);
    expect(acceptsHeader(headers, "application/xml")).toBe(false);
  });

  it("should reject types with explicit q=0", () => {
    const headers = { accept: "application/json; q=0, text/html" };
    expect(acceptsHeader(headers, "application/json")).toBe(false);
    expect(acceptsHeader(headers, "text/html")).toBe(true);
  });
});
