import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StaticPreCompress } from "../../../../../packages/core/http/compression/StaticPreCompress.js";
import * as utils from "../../../../../packages/core/http/compression/utils.js";

const temporaryDirectories: string[] = [];

function request(
	method: string,
	url: string,
	acceptEncoding?: string,
): IncomingMessage {
	return {
		method,
		url,
		headers: acceptEncoding ? { "accept-encoding": acceptEncoding } : {},
	} as IncomingMessage;
}

function response(): ServerResponse & {
	headers: Map<string, unknown>;
	writes: unknown[];
} {
	const headers = new Map<string, unknown>();
	const stream = new PassThrough();
	const writes: unknown[] = [];
	Object.assign(stream, {
		headers,
		writes,
		statusCode: 200,
		getHeader: (name: string) => headers.get(name.toLowerCase()),
		setHeader: (name: string, value: unknown) =>
			headers.set(name.toLowerCase(), value),
		write: (chunk: unknown) => {
			writes.push(chunk);
			return true;
		},
		end: () => stream,
	});
	return stream as unknown as ServerResponse & {
		headers: Map<string, unknown>;
		writes: unknown[];
	};
}

async function directoryWithAsset(): Promise<string> {
	const directory = await mkdtemp(path.join(os.tmpdir(), "subatom-static-"));
	temporaryDirectories.push(directory);
	await writeFile(path.join(directory, "app.js"), "console.log('app');");
	return directory;
}

afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("StaticPreCompress", () => {
	describe("resolvePrecompressedFile()", () => {
		it("should return the original path for identity negotiation", async () => {
			const directory = await directoryWithAsset();
			const compressor = new StaticPreCompress({ publicDir: directory });
			const assetPath = path.join(directory, "app.js");

			const result = compressor.resolvePrecompressedFile(
				request("GET", "/app.js", "identity"),
				assetPath,
			);
			expect(result).toEqual({ targetPath: assetPath, encoding: null });
		});

		it("should prefer the negotiated precompressed asset and fall back by priority", async () => {
			const directory = await directoryWithAsset();
			const compressor = new StaticPreCompress({ publicDir: directory });
			const assetPath = path.join(directory, "app.js");
			await writeFile(`${assetPath}.gz`, "gzip");

			const preferred = compressor.resolvePrecompressedFile(
				request("GET", "/app.js", "gzip"),
				assetPath,
			);
			const fallback = compressor.resolvePrecompressedFile(
				request("GET", "/app.js", "br"),
				assetPath,
			);

			expect(preferred).toEqual({
				targetPath: `${assetPath}.gz`,
				encoding: "gzip",
			});
			expect(fallback).toEqual({
				targetPath: `${assetPath}.gz`,
				encoding: "gzip",
			});
		});

		it("should return identity when no precompressed asset exists", async () => {
			const directory = await directoryWithAsset();
			const compressor = new StaticPreCompress({ publicDir: directory });
			const assetPath = path.join(directory, "app.js");

			const result = compressor.resolvePrecompressedFile(
				request("GET", "/app.js", "gzip"),
				assetPath,
			);
			expect(result).toEqual({ targetPath: assetPath, encoding: null });
		});

		it("should skip priority fallbacks when extMap has no entry for fallback algorithm", async () => {
			const directory = await directoryWithAsset();
			const compressor = new StaticPreCompress({
				publicDir: directory,
				extensionMap: { br: "", gzip: "", deflate: "" },
			});
			const assetPath = path.join(directory, "app.js");

			const result = compressor.resolvePrecompressedFile(
				request("GET", "/app.js", "br"),
				assetPath,
			);
			expect(result).toEqual({ targetPath: assetPath, encoding: null });
		});
	});

	describe("middleware()", () => {
		it("should call next for non-GET/HEAD methods, missing files, and directories", async () => {
			const directory = await directoryWithAsset();
			const compressor = new StaticPreCompress({ publicDir: directory });
			const next = () => undefined;
			const nonGetResponse = response();
			const missingResponse = response();

			await compressor.middleware()(
				request("POST", "/app.js"),
				nonGetResponse,
				next,
			);
			await compressor.middleware()(
				request("GET", "/missing.js", "gzip"),
				missingResponse,
				next,
			);

			expect(nonGetResponse.headers.size).toBe(0);
			expect(missingResponse.headers.size).toBe(0);
		});

		it("should serve a compressed HEAD response with content metadata", async () => {
			const directory = await directoryWithAsset();
			await writeFile(path.join(directory, "app.js.gz"), "compressed");
			const compressor = new StaticPreCompress({ publicDir: directory });
			const res = response();

			await compressor.middleware()(
				request("HEAD", "/app.js", "gzip"),
				res,
				() => undefined,
			);

			expect(res.headers.get("vary")).toBe("Accept-Encoding");
			expect(res.headers.get("content-encoding")).toBe("gzip");
			expect(res.headers.get("content-type")).toBe(
				"application/javascript; charset=utf-8",
			);
			expect(res.headers.get("content-length")).toBe(10);
			expect(res.statusCode).toBe(200);
		});

		it("should stream pre-compressed asset for GET requests", async () => {
			const directory = await directoryWithAsset();
			await writeFile(path.join(directory, "app.js.gz"), "compressed-content");
			const compressor = new StaticPreCompress({ publicDir: directory });
			const res = response();

			await new Promise<void>((resolve) => {
				res.on("finish", resolve);
				res.on("close", resolve);
				compressor
					.middleware()(request("GET", "/app.js", "gzip"), res, () => resolve())
					.then(() => {
						setTimeout(resolve, 50);
					});
			});

			expect(res.headers.get("content-encoding")).toBe("gzip");
			expect(res.headers.get("content-length")).toBe(18);
		});

		it("should handle directory path and empty req.url in middleware", async () => {
			const directory = await directoryWithAsset();
			const compressor = new StaticPreCompress({ publicDir: directory });
			const res = response();
			let nextCalled = 0;

			const reqEmptyUrl = { method: "GET" } as IncomingMessage;
			await compressor.middleware()(reqEmptyUrl, res, () => {
				nextCalled++;
			});

			expect(nextCalled).toBe(1);
		});

		it("should cover resolvePrecompressedFileAsync identity return and fallback misses (lines 97, 107-118)", async () => {
			const directory = await directoryWithAsset();
			const compressor = new StaticPreCompress({
				publicDir: directory,
				extensionMap: { br: "", gzip: "", deflate: "" },
			});
			const res = response();
			let nextCalled = 0;

			// 1. Identity negotiation branch in resolvePrecompressedFileAsync (line 97)
			await compressor.middleware()(
				request("GET", "/app.js", "identity"),
				res,
				() => {
					nextCalled++;
				},
			);
			expect(nextCalled).toBe(1);

			// 2. Preferred extension missing from extMap + fallback extensions missing (lines 107, 117)
			await compressor.middleware()(
				request("GET", "/app.js", "gzip"),
				res,
				() => {
					nextCalled++;
				},
			);
			expect(nextCalled).toBe(2);
		});

		it("should handle candidate path being a directory rather than a file (line 125)", async () => {
			const directory = await directoryWithAsset();
			// Create a directory named app.js.gz instead of a file
			await mkdir(path.join(directory, "app.js.gz"));

			const compressor = new StaticPreCompress({ publicDir: directory });
			const res = response();
			let nextCalled = 0;

			await compressor.middleware()(
				request("GET", "/app.js", "gzip"),
				res,
				() => {
					nextCalled++;
				},
			);

			// stat.isFile() is false, candidate is skipped, falls back to uncompressed
			expect(nextCalled).toBe(1);
		});

		it("should handle falsy mimeType branch (line 171)", async () => {
			const directory = await directoryWithAsset();
			await writeFile(path.join(directory, "app.js.gz"), "compressed-content");
			const compressor = new StaticPreCompress({ publicDir: directory });
			const res = response();

			// Spy on getStaticMimeType to return an empty string, triggering the false branch of if (mimeType)
			vi.spyOn(utils, "getStaticMimeType").mockReturnValue("");

			await compressor.middleware()(
				request("HEAD", "/app.js", "gzip"),
				res,
				() => undefined,
			);

			expect(res.headers.get("content-type")).toBeUndefined();
			expect(res.headers.get("content-encoding")).toBe("gzip");
		});

		it("should handle existing Vary header (appending or leaving intact)", async () => {
			const directory = await directoryWithAsset();
			const compressor = new StaticPreCompress({ publicDir: directory });

			const res1 = response();
			res1.setHeader("Vary", "Origin");
			await compressor.middleware()(
				request("GET", "/app.js", "identity"),
				res1,
				() => undefined,
			);
			expect(res1.headers.get("vary")).toBe("Origin, Accept-Encoding");

			const res2 = response();
			res2.setHeader("Vary", "Accept-Encoding");
			await compressor.middleware()(
				request("GET", "/app.js", "identity"),
				res2,
				() => undefined,
			);
			expect(res2.headers.get("vary")).toBe("Accept-Encoding");
		});

		it("should call next when the source exists but no compressed variant is available", async () => {
			const directory = await directoryWithAsset();
			const compressor = new StaticPreCompress({ publicDir: directory });
			const res = response();
			let nextCalls = 0;

			await compressor.middleware()(
				request("GET", "/app.js", "gzip"),
				res,
				() => {
					nextCalls += 1;
				},
			);

			expect(nextCalls).toBe(1);
			expect(res.headers.get("vary")).toBe("Accept-Encoding");
		});
	});
});
