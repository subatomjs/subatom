/// <reference types="node" />

import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import zlib from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { SubatomCompression } from "../../../package/core/http/compression/compressor.js";

describe("compressor.ts - SubatomCompression", () => {
	const createReqRes = (method = "GET") => {
		const req = new IncomingMessage(new Socket());
		req.method = method;
		const res = new ServerResponse(req);
		return { req, res };
	};

	describe("Constructor and Options Normalization", () => {
		it("initializes with robust defaults", () => {
			const engine = new SubatomCompression();
			expect(engine.opts.algorithms).toEqual(["br", "gzip", "deflate"]);
			expect(engine.opts.threshold).toBe(1024);
			expect(engine.opts.enableBreachMitigation).toBe(true);
			expect(engine.opts.sensitiveHeaders).toEqual([
				"set-cookie",
				"x-csrf-token",
			]);
			expect(engine.opts.levels.br).toBe(4);
			expect(engine.opts.levels.gzip).toBe(
				zlib.constants.Z_DEFAULT_COMPRESSION,
			);
			expect(engine.opts.levels.deflate).toBe(
				zlib.constants.Z_DEFAULT_COMPRESSION,
			);
		});

		it("normalizes custom options and clamps levels properly", () => {
			const engine = new SubatomCompression({
				algorithms: ["gzip"],
				threshold: 500,
				enableBreachMitigation: false,
				sensitiveHeaders: [" X-Auth-Token ", "AUTHORIZATION"],
				levels: {
					br: 15, // should clamp to 11
					gzip: 12, // should clamp to 9
					deflate: -5, // should clamp to -1
				},
			});

			expect(engine.opts.algorithms).toEqual(["gzip"]);
			expect(engine.opts.threshold).toBe(500);
			expect(engine.opts.enableBreachMitigation).toBe(false);
			expect(engine.opts.sensitiveHeaders).toEqual([
				"x-auth-token",
				"authorization",
			]);
			expect(engine.opts.levels.br).toBe(11);
			expect(engine.opts.levels.gzip).toBe(9);
			expect(engine.opts.levels.deflate).toBe(-1);
		});

		it("handles invalid or non-finite threshold gracefully", () => {
			const engine = new SubatomCompression({ threshold: NaN });
			expect(engine.opts.threshold).toBe(1024);

			const engineNegative = new SubatomCompression({ threshold: -50 });
			expect(engineNegative.opts.threshold).toBe(0);
		});
	});

	describe("negotiate()", () => {
		it("delegates to negotiateEncoding correctly", () => {
			const engine = new SubatomCompression({ algorithms: ["gzip", "br"] });
			const result = engine.negotiate("gzip;q=0.5, br;q=1");
			expect(result.algorithm).toBe("br");
			expect(result.acceptable).toBe(true);
		});
	});

	describe("isCompressible()", () => {
		it("returns false if custom shouldCompress predicate returns false", () => {
			const engine = new SubatomCompression({
				shouldCompress: () => false,
			});
			const { req, res } = createReqRes();
			res.setHeader("Content-Type", "text/html");
			expect(engine.isCompressible(req, res)).toBe(false);
		});

		it("returns false if response already has Content-Encoding", () => {
			const engine = new SubatomCompression();
			const { req, res } = createReqRes();
			res.setHeader("Content-Type", "text/html");
			res.setHeader("Content-Encoding", "gzip");
			expect(engine.isCompressible(req, res)).toBe(false);
		});

		it("returns false for bodyless responses (HEAD or 204/304/1xx)", () => {
			const engine = new SubatomCompression();
			const { req, res } = createReqRes("HEAD");
			res.setHeader("Content-Type", "text/html");
			expect(engine.isCompressible(req, res)).toBe(false);

			const { req: req2, res: res2 } = createReqRes("GET");
			res2.statusCode = 204;
			res2.setHeader("Content-Type", "text/html");
			expect(engine.isCompressible(req2, res2)).toBe(false);
		});

		it("returns false when BREACH mitigation is active and sensitive headers exist", () => {
			const engine = new SubatomCompression({ enableBreachMitigation: true });
			const { req, res } = createReqRes();
			res.setHeader("Content-Type", "text/html");
			res.setHeader("Set-Cookie", "session=abc");
			expect(engine.isCompressible(req, res)).toBe(false);

			const { req: req2, res: res2 } = createReqRes();
			res2.setHeader("Content-Type", "text/html");
			res2.setHeader("X-Csrf-Token", "csrf-secret");
			expect(engine.isCompressible(req2, res2)).toBe(false);
		});

		it("allows compression with sensitive headers if BREACH mitigation is disabled", () => {
			const engine = new SubatomCompression({ enableBreachMitigation: false });
			const { req, res } = createReqRes();
			res.setHeader("Content-Type", "text/html");
			res.setHeader("Set-Cookie", "session=abc");
			res.setHeader("Content-Length", 2048);
			expect(engine.isCompressible(req, res)).toBe(true);
		});

		it("returns false if Content-Type is missing or not matched by mimeTypes", () => {
			const engine = new SubatomCompression();
			const { req, res } = createReqRes();
			expect(engine.isCompressible(req, res)).toBe(false);

			res.setHeader("Content-Type", "image/jpeg");
			expect(engine.isCompressible(req, res)).toBe(false);
		});

		it("matches mimeTypes with both RegExp and exact string patterns", () => {
			const engine = new SubatomCompression({
				mimeTypes: ["application/custom-json", /^text\/custom$/i],
			});

			const { req: req1, res: res1 } = createReqRes();
			res1.setHeader("Content-Type", "application/custom-json; charset=utf-8");
			expect(engine.isCompressible(req1, res1)).toBe(true);

			const { req: req2, res: res2 } = createReqRes();
			res2.setHeader("Content-Type", "text/custom");
			expect(engine.isCompressible(req2, res2)).toBe(true);
		});

		it("evaluates Content-Length header against threshold", () => {
			const engine = new SubatomCompression({ threshold: 1000 });
			const { req, res } = createReqRes();
			res.setHeader("Content-Type", "text/html");

			res.setHeader("Content-Length", 500);
			expect(engine.isCompressible(req, res)).toBe(false);

			res.setHeader("Content-Length", 1000);
			expect(engine.isCompressible(req, res)).toBe(true);

			res.setHeader("Content-Length", "invalid");
			expect(engine.isCompressible(req, res)).toBe(false);

			res.setHeader("Content-Length", -10);
			expect(engine.isCompressible(req, res)).toBe(false);
		});

		it("evaluates knownLength argument against threshold when Content-Length header is not set", () => {
			const engine = new SubatomCompression({ threshold: 500 });
			const { req, res } = createReqRes();
			res.setHeader("Content-Type", "text/html");

			expect(engine.isCompressible(req, res, 200)).toBe(false);
			expect(engine.isCompressible(req, res, 500)).toBe(true);
			expect(engine.isCompressible(req, res, 800)).toBe(true);
		});

		it("returns true for chunked/streaming responses when length is unknown and mimeType matches", () => {
			const engine = new SubatomCompression();
			const { req, res } = createReqRes();
			res.setHeader("Content-Type", "text/html");
			expect(engine.isCompressible(req, res)).toBe(true);
		});
	});

	describe("createCompressorStream()", () => {
		const engine = new SubatomCompression();

		it("creates Brotli compressor stream for 'br'", () => {
			const stream = engine.createCompressorStream("br");
			expect(stream).not.toBeNull();
			stream?.destroy();
		});

		it("creates Gzip compressor stream for 'gzip'", () => {
			const stream = engine.createCompressorStream("gzip");
			expect(stream).not.toBeNull();
			stream?.destroy();
		});

		it("creates Deflate compressor stream for 'deflate'", () => {
			const stream = engine.createCompressorStream("deflate");
			expect(stream).not.toBeNull();
			stream?.destroy();
		});

		it("returns null for 'identity' or unknown algorithms", () => {
			expect(engine.createCompressorStream("identity")).toBeNull();
			// @ts-expect-error test unknown
			expect(engine.createCompressorStream("unknown")).toBeNull();
		});

		it("handles zlib creation errors gracefully and returns null", () => {
			const spy = vi.spyOn(zlib, "createGzip").mockImplementationOnce(() => {
				throw new Error("zlib init failure");
			});

			expect(engine.createCompressorStream("gzip")).toBeNull();
			spy.mockRestore();
		});
	});
});
