import type { ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  clearCookie,
  setCookie,
} from "../../../../package/core/http/response/services/cookie.service.js";

describe("cookie.service", () => {
  function createMockServerResponse() {
    return {
      setHeader: vi.fn(),
    } as unknown as ServerResponse;
  }

  describe("setCookie", () => {
    it("should set basic cookie with default HttpOnly and default Path /", () => {
      const raw = createMockServerResponse();
      const headersMap = new Map<string, string | string[]>();

      setCookie(raw, headersMap, false, "user_id", "12345");

      expect(headersMap.get("set-cookie")).toBe(
        "user_id=12345; Path=/; HttpOnly",
      );
      expect(raw.setHeader).toHaveBeenCalledWith(
        "Set-Cookie",
        "user_id=12345; Path=/; HttpOnly",
      );
    });

    it("should apply all options correctly (maxAge, expires, domain, path, secure, sameSite)", () => {
      const raw = createMockServerResponse();
      const headersMap = new Map<string, string | string[]>();
      const expires = new Date("2026-12-31T23:59:59Z");

      setCookie(raw, headersMap, false, "token", "secret", {
        maxAge: 3600000, // 3600 seconds
        expires,
        domain: "subatom.dev",
        path: "/api",
        secure: true,
        httpOnly: false,
        sameSite: "Lax",
      });

      const expected =
        "token=secret; Max-Age=3600; Expires=" +
        expires.toUTCString() +
        "; Domain=subatom.dev; Path=/api; Secure; SameSite=Lax";

      expect(headersMap.get("set-cookie")).toBe(expected);
    });

    it("should convert boolean sameSite=true to SameSite=Strict", () => {
      const raw = createMockServerResponse();
      const headersMap = new Map<string, string | string[]>();

      setCookie(raw, headersMap, false, "session", "xyz", {
        sameSite: true,
      });

      expect(headersMap.get("set-cookie")).toBe(
        "session=xyz; Path=/; HttpOnly; SameSite=Strict",
      );
    });

    it("should throw on CRLF injection in cookie name, value, or domain", () => {
      const raw = createMockServerResponse();
      const headersMap = new Map<string, string | string[]>();

      expect(() =>
        setCookie(raw, headersMap, false, "name\r\n", "val"),
      ).toThrowError(/Refusing to set header "Set-Cookie \(name\)"/);

      expect(() =>
        setCookie(raw, headersMap, false, "name", "val\n"),
      ).toThrowError(/Refusing to set header "Set-Cookie \(value\)"/);

      expect(() =>
        setCookie(raw, headersMap, false, "name", "val", {
          domain: "domain\r.com",
        }),
      ).toThrowError(/Refusing to set header "Set-Cookie \(domain\)"/);
    });

    it("should append to existing string Set-Cookie", () => {
      const raw = createMockServerResponse();
      const headersMap = new Map<string, string | string[]>([
        ["set-cookie", "c1=v1; Path=/; HttpOnly"],
      ]);

      setCookie(raw, headersMap, false, "c2", "v2");

      expect(headersMap.get("set-cookie")).toEqual([
        "c1=v1; Path=/; HttpOnly",
        "c2=v2; Path=/; HttpOnly",
      ]);
    });

    it("should append to existing array Set-Cookie", () => {
      const raw = createMockServerResponse();
      const headersMap = new Map<string, string | string[]>([
        ["set-cookie", ["c1=v1", "c2=v2"]],
      ]);

      setCookie(raw, headersMap, false, "c3", "v3");

      expect(headersMap.get("set-cookie")).toEqual([
        "c1=v1",
        "c2=v2",
        "c3=v3; Path=/; HttpOnly",
      ]);
    });
  });

  describe("clearCookie", () => {
    it("should clear cookie with empty value and epoch expiration", () => {
      const raw = createMockServerResponse();
      const headersMap = new Map<string, string | string[]>();

      clearCookie(raw, headersMap, false, "session", {
        path: "/auth",
        maxAge: 99999, // Should be omitted
      });

      const epochUtc = new Date(0).toUTCString();
      expect(headersMap.get("set-cookie")).toBe(
        `session=; Expires=${epochUtc}; Path=/auth; HttpOnly`,
      );
    });
  });
});
