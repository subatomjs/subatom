import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, it, expect, vi } from "vitest";
import { Compression } from "../../../../../packages/core/http/compression/Compression.js";

describe("Compression", () => {
  it("should initialize with default configurations", () => {
    const compression = new Compression();
    expect(compression.opts.algorithms).toEqual(["br", "gzip", "deflate"]);
    expect(compression.opts.threshold).toBe(1024);
    expect(compression.opts.enableBreachMitigation).toBe(true);
    expect(compression.opts.sensitiveHeaders).toEqual([
      "set-cookie",
      "x-csrf-token",
    ]);
  });

  it("should sanitize threshold and custom levels", () => {
    const compression = new Compression({
      threshold: -50,
      levels: { br: 99, gzip: -5, deflate: 15 },
    });
    expect(compression.opts.threshold).toBe(0);
    expect(compression.opts.levels.br).toBe(11);
    expect(compression.opts.levels.gzip).toBe(-1);
    expect(compression.opts.levels.deflate).toBe(9);
  });

  it("should delegate negotiation to negotiateEncoding", () => {
    const compression = new Compression({ algorithms: ["gzip"] });
    const result = compression.negotiate("gzip;q=0.8");
    expect(result.algorithm).toBe("gzip");
    expect(result.qValue).toBe(0.8);
  });

  describe("isCompressible", () => {
    const createMocks = (headers: Record<string, unknown> = {}) => {
      const headerStore = new Map<string, unknown>(Object.entries(headers));
      const req = { method: "GET" } as IncomingMessage;
      const res = {
        statusCode: 200,
        getHeader: (k: string) => headerStore.get(k.toLowerCase()),
      } as unknown as ServerResponse;
      return { req, res, headerStore };
    };

    it("should return false if shouldCompress filter returns false", () => {
      const compression = new Compression({
        shouldCompress: () => false,
      });
      const { req, res } = createMocks({ "content-type": "text/html" });
      expect(compression.isCompressible(req, res, 2048)).toBe(false);
    });

    it("should return false if content-encoding is already present", () => {
      const compression = new Compression();
      const { req, res } = createMocks({
        "content-type": "text/html",
        "content-encoding": "gzip",
      });
      expect(compression.isCompressible(req, res, 2048)).toBe(false);
    });

    it("should return false for bodyless responses", () => {
      const compression = new Compression();
      const { req, res } = createMocks({ "content-type": "text/html" });
      (req as { method: string }).method = "HEAD";
      expect(compression.isCompressible(req, res, 2048)).toBe(false);
    });

    it("should reject compression under BREACH mitigation if sensitive headers exist", () => {
      const compression = new Compression({ enableBreachMitigation: true });
      const { req, res } = createMocks({
        "content-type": "text/html",
        "set-cookie": "session=123",
      });
      expect(compression.isCompressible(req, res, 2048)).toBe(false);
    });

    it("should reject when content-type is missing or ineligible", () => {
      const compression = new Compression();
      const { req, res, headerStore } = createMocks();
      expect(compression.isCompressible(req, res, 2048)).toBe(false);

      headerStore.set("content-type", "image/png");
      expect(compression.isCompressible(req, res, 2048)).toBe(false);
    });

    it("should accept eligible MIME type strings or RegExps", () => {
      const compression = new Compression({
        mimeTypes: ["custom/data", /^application\/custom-.+$/i],
      });
      const { req, res, headerStore } = createMocks();

      headerStore.set("content-type", "custom/data; charset=utf-8");
      expect(compression.isCompressible(req, res, 2048)).toBe(true);

      headerStore.set("content-type", "application/custom-payload");
      expect(compression.isCompressible(req, res, 2048)).toBe(true);
    });

    it("should validate Content-Length or knownLength against threshold", () => {
      const compression = new Compression({ threshold: 500 });
      const { req, res, headerStore } = createMocks({
        "content-type": "application/json",
      });

      headerStore.set("content-length", "100");
      expect(compression.isCompressible(req, res)).toBe(false);

      headerStore.set("content-length", "600");
      expect(compression.isCompressible(req, res)).toBe(true);

      headerStore.delete("content-length");
      expect(compression.isCompressible(req, res, 300)).toBe(false);
      expect(compression.isCompressible(req, res, 700)).toBe(true);
      expect(compression.isCompressible(req, res)).toBe(true);
    });

    it("should reject when content-length is invalid or negative", () => {
      const compression = new Compression();
      const { req, res } = createMocks({
        "content-type": "text/html",
        "content-length": "-1",
      });
      expect(compression.isCompressible(req, res)).toBe(false);
    });
  });

  describe("createCompressorStream", () => {
    it("should create compressor streams for supported algorithms", () => {
      const compression = new Compression();
      expect(compression.createCompressorStream("br")).not.toBeNull();
      expect(compression.createCompressorStream("gzip")).not.toBeNull();
      expect(compression.createCompressorStream("deflate")).not.toBeNull();
      expect(
        compression.createCompressorStream("identity" as never),
      ).toBeNull();
    });
  });
});