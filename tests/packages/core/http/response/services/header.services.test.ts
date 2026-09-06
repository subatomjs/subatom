/// <reference types="node" />

import type { ServerResponse } from "node:http";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setHeader, assertNoHeaderInjection } from "../../../../../../packages/core/http/response/services/setHeader.service.js";
import { appendHeader } from "../../../../../../packages/core/http/response/services/appendHeader.service.js";
import { removeHeader } from "../../../../../../packages/core/http/response/services/removeHeader.service.js";
import { varyHeader } from "../../../../../../packages/core/http/response/services/varyHeader.service.js";
import { setStatusCode } from "../../../../../../packages/core/http/response/services/statusCode.service.js";
import { SubatomError } from "../../../../../../packages/errors/Errors.js";

describe("Response Header and Status Services", () => {
  let raw: ServerResponse;
  let headersMap: Map<string, string | string[]>;
  let rawHeaders: Record<string, unknown>;

  beforeEach(() => {
    headersMap = new Map();
    rawHeaders = {};
    raw = {
      setHeader: vi.fn((k: string, v: unknown) => {
        rawHeaders[k] = v;
      }),
      removeHeader: vi.fn((k: string) => {
        delete rawHeaders[k];
      }),
      statusCode: 200,
    } as unknown as ServerResponse;
  });

  describe("setHeader", () => {
    it("should set single header and track in map case-insensitively", () => {
      setHeader(raw, headersMap, false, "Content-Type", "application/json");
      expect(headersMap.get("content-type")).toBe("application/json");
      expect(raw.setHeader).toHaveBeenCalledWith("Content-Type", "application/json");
    });

    it("should set multiple headers when given an object record", () => {
      setHeader(raw, headersMap, false, {
        "X-Rate-Limit": "100",
        "X-Frame-Options": "DENY",
      });
      expect(headersMap.get("x-rate-limit")).toBe("100");
      expect(headersMap.get("x-frame-options")).toBe("DENY");
    });

    it("should warn and skip setting headers when headersSent is true", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      setHeader(raw, headersMap, true, "X-Late", "value");
      expect(headersMap.has("x-late")).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Cannot set headers after they are sent"),
      );
      warnSpy.mockRestore();
    });

    it("should ignore a string header when its value is undefined", () => {
      setHeader(raw, headersMap, false, "X-Missing", undefined);

      expect(headersMap.has("x-missing")).toBe(false);
      expect(raw.setHeader).not.toHaveBeenCalledWith("X-Missing", undefined);
    });

    it("should throw SubatomError if header value contains CR or LF characters", () => {
      expect(() =>
        assertNoHeaderInjection("X-Injected", "value\r\nInjected-Header: evil"),
      ).toThrow(SubatomError);

      expect(() =>
        setHeader(raw, headersMap, false, "X-Injected", "bad\nvalue"),
      ).toThrow(SubatomError);
    });
  });

  describe("appendHeader", () => {
    it("should set a new header if it does not yet exist", () => {
      appendHeader(raw, headersMap, false, "Accept-Encoding", "gzip");
      expect(headersMap.get("accept-encoding")).toBe("gzip");
    });

    it("should set a new header with multiple values as an array", () => {
      appendHeader(raw, headersMap, false, "Accept-Encoding", ["gzip", "br"]);

      expect(headersMap.get("accept-encoding")).toEqual(["gzip", "br"]);
    });

    it("should merge string or array into an array of header values", () => {
      appendHeader(raw, headersMap, false, "Set-Cookie", "a=1");
      appendHeader(raw, headersMap, false, "Set-Cookie", "b=2");
      expect(headersMap.get("set-cookie")).toEqual(["a=1", "b=2"]);

      appendHeader(raw, headersMap, false, "Set-Cookie", ["c=3", "d=4"]);
      expect(headersMap.get("set-cookie")).toEqual(["a=1", "b=2", "c=3", "d=4"]);
    });

    it("should append to an existing array-valued header", () => {
      headersMap.set("set-cookie", ["a=1", "b=2"]);

      appendHeader(raw, headersMap, false, "Set-Cookie", "c=3");

      expect(headersMap.get("set-cookie")).toEqual(["a=1", "b=2", "c=3"]);
    });
  });

  describe("removeHeader", () => {
    it("should delete header from tracking map and raw response", () => {
      headersMap.set("x-temp", "value");
      removeHeader(raw, headersMap, false, "x-temp");
      expect(headersMap.has("x-temp")).toBe(false);
      expect(raw.removeHeader).toHaveBeenCalledWith("x-temp");
    });

    it("should warn and no-op if headers are already sent", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      headersMap.set("x-temp", "value");
      removeHeader(raw, headersMap, true, "x-temp");
      expect(headersMap.has("x-temp")).toBe(true);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("varyHeader", () => {
    it("should append unique fields to Vary header", () => {
      varyHeader(raw, headersMap, false, "Origin");
      expect(headersMap.get("vary")).toBe("Origin");

      varyHeader(raw, headersMap, false, "User-Agent");
      expect(headersMap.get("vary")).toBe("Origin, User-Agent");

      varyHeader(raw, headersMap, false, "Origin");
      expect(headersMap.get("vary")).toBe("Origin, User-Agent");
    });

    it("should preserve wildcard and avoid duplicate Vary fields", () => {
      varyHeader(raw, headersMap, false, "*");
      varyHeader(raw, headersMap, false, "*");

      expect(headersMap.get("vary")).toBe("*");
    });

    it("should normalize an existing array-valued Vary header", () => {
      headersMap.set("vary", ["Origin", "Accept"]);

      varyHeader(raw, headersMap, false, "User-Agent");

      expect(headersMap.get("vary")).toBe("Origin, Accept, User-Agent");
    });
  });

  describe("setStatusCode", () => {
    it("should assign raw status code when unsent", () => {
      const code = setStatusCode(raw, false, 404, 200);
      expect(code).toBe(404);
      expect(raw.statusCode).toBe(404);
    });

    it("should maintain current status code and log a warning if headers are sent", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const code = setStatusCode(raw, true, 500, 200);
      expect(code).toBe(200);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Cannot set status code after headers are sent"),
      );
      warnSpy.mockRestore();
    });
  });
});