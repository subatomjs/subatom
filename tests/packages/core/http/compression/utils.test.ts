/// <reference types="node" />
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, it, expect } from "vitest";
import {
  addVaryAcceptEncoding,
  clampInteger,
  getChunkByteLength,
  getHeaderString,
  getStaticMimeType,
  isBodylessResponse,
  normalizeMimeType,
  parseQValue,
} from "../../../../../packages/core/http/compression/utils.js";

describe("Compression Utilities", () => {
  describe("getChunkByteLength", () => {
    it("should return 0 when chunk is undefined", () => {
      expect(getChunkByteLength(undefined)).toBe(0);
    });

    it("should compute byte length of string with optional encoding", () => {
      expect(getChunkByteLength("subatom")).toBe(7);
      expect(getChunkByteLength("✓")).toBe(3);
      expect(getChunkByteLength("616263", "hex")).toBe(3);
    });

    it("should return byteLength for Buffer and Uint8Array instances", () => {
      const buf = Buffer.from("subatom");
      const uint8 = new Uint8Array([1, 2, 3, 4]);
      expect(getChunkByteLength(buf)).toBe(7);
      expect(getChunkByteLength(uint8)).toBe(4);
    });

    it("should return undefined for unsupported object types", () => {
      expect(getChunkByteLength({})).toBeUndefined();
      expect(getChunkByteLength(12345)).toBeUndefined();
    });
  });

  describe("clampInteger", () => {
    it("should clamp values within bounds", () => {
      expect(clampInteger(5, 1, 10, 4)).toBe(5);
      expect(clampInteger(0, 1, 10, 4)).toBe(1);
      expect(clampInteger(20, 1, 10, 4)).toBe(10);
      expect(clampInteger(5.8, 1, 10, 4)).toBe(5);
    });

    it("should return fallback when value is not finite", () => {
      expect(clampInteger(Number.NaN, 0, 9, 4)).toBe(4);
      expect(clampInteger(Number.POSITIVE_INFINITY, 0, 9, 4)).toBe(4);
    });
  });

  describe("parseQValue", () => {
    it("should parse valid q-values", () => {
      expect(parseQValue("1")).toBe(1);
      expect(parseQValue("0")).toBe(0);
      expect(parseQValue("0.8")).toBe(0.8);
      expect(parseQValue("0.123")).toBe(0.123);
    });

    it("should return null for empty or invalid strings", () => {
      expect(parseQValue("")).toBeNull();
      expect(parseQValue("   ")).toBeNull();
      expect(parseQValue("abc")).toBeNull();
      expect(parseQValue("-0.1")).toBeNull();
      expect(parseQValue("1.5")).toBeNull();
    });

    it("should return null when decimal places exceed 3 digits", () => {
      expect(parseQValue("0.1234")).toBeNull();
    });
  });

  describe("normalizeMimeType", () => {
    it("should strip charset and parameters and convert to lowercase", () => {
      expect(normalizeMimeType("text/html; charset=utf-8")).toBe("text/html");
      expect(normalizeMimeType("APPLICATION/JSON; boundary=something")).toBe(
        "application/json",
      );
      expect(normalizeMimeType("")).toBe("");
    });
  });

  describe("getHeaderString", () => {
    it("should format string, number, and array headers", () => {
      const createRes = (headerVal: unknown) =>
        ({
          getHeader: () => headerVal,
        }) as unknown as ServerResponse;

      expect(getHeaderString(createRes("gzip"), "test")).toBe("gzip");
      expect(getHeaderString(createRes(100), "test")).toBe("100");
      expect(getHeaderString(createRes(["gzip", "br"]), "test")).toBe(
        "gzip, br",
      );
      expect(getHeaderString(createRes(undefined), "test")).toBeUndefined();
    });
  });

  describe("isBodylessResponse", () => {
    it("should identify HEAD requests as bodyless", () => {
      const req = { method: "HEAD" } as IncomingMessage;
      const res = { statusCode: 200 } as ServerResponse;
      expect(isBodylessResponse(req, res)).toBe(true);
    });

    it("should identify 1xx, 204, and 304 status codes as bodyless", () => {
      const req = { method: "GET" } as IncomingMessage;
      expect(
        isBodylessResponse(req, { statusCode: 101 } as ServerResponse),
      ).toBe(true);
      expect(
        isBodylessResponse(req, { statusCode: 204 } as ServerResponse),
      ).toBe(true);
      expect(
        isBodylessResponse(req, { statusCode: 304 } as ServerResponse),
      ).toBe(true);
      expect(
        isBodylessResponse(req, { statusCode: 200 } as ServerResponse),
      ).toBe(false);
    });
  });

  describe("addVaryAcceptEncoding", () => {
    it("should set Vary header if absent", () => {
      const headers = new Map<string, unknown>();
      const res = {
        getHeader: (k: string) => headers.get(k),
        setHeader: (k: string, v: unknown) => headers.set(k, v),
      } as unknown as ServerResponse;

      addVaryAcceptEncoding(res);
      expect(headers.get("Vary")).toBe("Accept-Encoding");
    });

    it("should do nothing if Vary is wildcard *", () => {
      const headers = new Map<string, unknown>([["Vary", "*"]]);
      const res = {
        getHeader: (k: string) => headers.get(k),
        setHeader: (k: string, v: unknown) => headers.set(k, v),
      } as unknown as ServerResponse;

      addVaryAcceptEncoding(res);
      expect(headers.get("Vary")).toBe("*");
    });

    it("should append Accept-Encoding without duplicating", () => {
      const headers = new Map<string, unknown>([["Vary", "Origin"]]);
      const res = {
        getHeader: (k: string) => headers.get(k),
        setHeader: (k: string, v: unknown) => headers.set(k, v),
      } as unknown as ServerResponse;

      addVaryAcceptEncoding(res);
      expect(headers.get("Vary")).toBe("Origin, Accept-Encoding");

      addVaryAcceptEncoding(res);
      expect(headers.get("Vary")).toBe("Origin, Accept-Encoding");
    });

    it("should support array-formatted existing Vary headers", () => {
      const headers = new Map<string, unknown>([["Vary", ["Origin", "Cookie"]]]);
      const res = {
        getHeader: (k: string) => headers.get(k),
        setHeader: (k: string, v: unknown) => headers.set(k, v),
      } as unknown as ServerResponse;

      addVaryAcceptEncoding(res);
      expect(headers.get("Vary")).toBe("Origin, Cookie, Accept-Encoding");
    });
  });

  describe("getStaticMimeType", () => {
    it("should return matching MIME type based on file extension", () => {
      expect(getStaticMimeType("bundle.js")).toBe(
        "application/javascript; charset=utf-8",
      );
      expect(getStaticMimeType("index.html")).toBe("text/html; charset=utf-8");
      expect(getStaticMimeType("style.css")).toBe("text/css; charset=utf-8");
      expect(getStaticMimeType("data.json")).toBe(
        "application/json; charset=utf-8",
      );
      expect(getStaticMimeType("logo.svg")).toBe("image/svg+xml");
      expect(getStaticMimeType("module.wasm")).toBe("application/wasm");
      expect(getStaticMimeType("unknown.ext")).toBe("application/octet-stream");
    });
  });
});