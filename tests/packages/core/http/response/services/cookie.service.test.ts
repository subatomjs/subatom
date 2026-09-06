import type { ServerResponse } from "node:http";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setCookie, clearCookie } from "../../../../../../packages/core/http/response/services/cookie.service.js";
import { SubatomError } from "../../../../../../packages/errors/Errors.js";

describe("cookie.service", () => {
  let raw: ServerResponse;
  let headersMap: Map<string, string | string[]>;

  beforeEach(() => {
    headersMap = new Map();
    raw = {
      setHeader: vi.fn(),
    } as unknown as ServerResponse;
  });

  it("should format standard cookies with path=/ and HttpOnly by default", () => {
    setCookie(raw, headersMap, false, "session", "12345");
    expect(headersMap.get("set-cookie")).toBe("session=12345; Path=/; HttpOnly");
  });

  it("should format full cookie attributes including maxAge, secure, and sameSite", () => {
    const expires = new Date("2026-10-01T00:00:00.000Z");
    setCookie(raw, headersMap, false, "auth", "token", {
      maxAge: 60000,
      expires,
      domain: "subatom.dev",
      path: "/api",
      secure: true,
      httpOnly: false,
      sameSite: "Strict",
    });

    const cookieVal = headersMap.get("set-cookie") as string;
    expect(cookieVal).toContain("auth=token");
    expect(cookieVal).toContain("Max-Age=60");
    expect(cookieVal).toContain(`Expires=${expires.toUTCString()}`);
    expect(cookieVal).toContain("Domain=subatom.dev");
    expect(cookieVal).toContain("Path=/api");
    expect(cookieVal).toContain("Secure");
    expect(cookieVal).not.toContain("HttpOnly");
    expect(cookieVal).toContain("SameSite=Strict");
  });

  it("should convert boolean sameSite=true into SameSite=Strict", () => {
    setCookie(raw, headersMap, false, "track", "1", { sameSite: true });
    expect(headersMap.get("set-cookie")).toContain("SameSite=Strict");
  });

  it("should accumulate multiple Set-Cookie headers in an array", () => {
    setCookie(raw, headersMap, false, "c1", "v1");
    setCookie(raw, headersMap, false, "c2", "v2");
    setCookie(raw, headersMap, false, "c3", "v3");

    const cookies = headersMap.get("set-cookie");
    expect(Array.isArray(cookies)).toBe(true);
    expect(cookies).toHaveLength(3);
  });

  it("should clear cookies by setting value to empty and expires to Unix epoch", () => {
    clearCookie(raw, headersMap, false, "session", { path: "/auth" });
    const cleared = headersMap.get("set-cookie") as string;
    expect(cleared).toContain("session=");
    expect(cleared).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    expect(cleared).toContain("Path=/auth");
  });

  it("should reject CRLF injection in cookie name, value, or domain", () => {
    expect(() =>
      setCookie(raw, headersMap, false, "bad\r\nname", "val"),
    ).toThrow(SubatomError);

    expect(() =>
      setCookie(raw, headersMap, false, "name", "bad\nval"),
    ).toThrow(SubatomError);

    expect(() =>
      setCookie(raw, headersMap, false, "name", "val", { domain: "subatom.dev\r\n" }),
    ).toThrow(SubatomError);
  });
});