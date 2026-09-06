import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { StaticPreCompress } from "../../../../../packages/core/http/compression/StaticPreCompress.js";

const temporaryDirectories: string[] = [];

function request(method: string, url: string, acceptEncoding?: string): IncomingMessage {
  return { method, url, headers: acceptEncoding ? { "accept-encoding": acceptEncoding } : {} } as IncomingMessage;
}

function response(): ServerResponse & { headers: Map<string, unknown> } {
  const headers = new Map<string, unknown>();
  const stream = new PassThrough();
  Object.assign(stream, {
    headers,
    statusCode: 200,
    getHeader: (name: string) => headers.get(name.toLowerCase()),
    setHeader: (name: string, value: unknown) => headers.set(name.toLowerCase(), value),
    end: () => stream,
  });
  return stream as unknown as ServerResponse & { headers: Map<string, unknown> };
}

async function directoryWithAsset(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "subatom-static-"));
  temporaryDirectories.push(directory);
  await writeFile(path.join(directory, "app.js"), "console.log('app');");
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("StaticPreCompress", () => {
  describe("resolvePrecompressedFile()", () => {
    it("should return the original path for identity negotiation", async () => {
      // Arrange
      const directory = await directoryWithAsset();
      const compressor = new StaticPreCompress({ publicDir: directory });
      const assetPath = path.join(directory, "app.js");

      // Act
      const result = compressor.resolvePrecompressedFile(request("GET", "/app.js", "identity"), assetPath);

      // Assert
      expect(result).toEqual({ targetPath: assetPath, encoding: null });
    });

    it("should prefer the negotiated precompressed asset and fall back by priority", async () => {
      // Arrange
      const directory = await directoryWithAsset();
      const compressor = new StaticPreCompress({ publicDir: directory });
      const assetPath = path.join(directory, "app.js");
      await writeFile(`${assetPath}.gz`, "gzip");

      // Act
      const preferred = compressor.resolvePrecompressedFile(request("GET", "/app.js", "gzip"), assetPath);
      const fallback = compressor.resolvePrecompressedFile(request("GET", "/app.js", "br"), assetPath);

      // Assert
      expect(preferred).toEqual({ targetPath: `${assetPath}.gz`, encoding: "gzip" });
      expect(fallback).toEqual({ targetPath: `${assetPath}.gz`, encoding: "gzip" });
    });

    it("should return identity when no precompressed asset exists", async () => {
      // Arrange
      const directory = await directoryWithAsset();
      const compressor = new StaticPreCompress({ publicDir: directory });
      const assetPath = path.join(directory, "app.js");

      // Act
      const result = compressor.resolvePrecompressedFile(request("GET", "/app.js", "gzip"), assetPath);

      // Assert
      expect(result).toEqual({ targetPath: assetPath, encoding: null });
    });
  });

  describe("middleware()", () => {
    it("should call next for non-GET methods, missing files, and directories", async () => {
      // Arrange
      const directory = await directoryWithAsset();
      const compressor = new StaticPreCompress({ publicDir: directory });
      const next = () => undefined;
      const nonGetResponse = response();
      const missingResponse = response();

      // Act
      await compressor.middleware()(request("POST", "/app.js"), nonGetResponse, next);
      await compressor.middleware()(request("GET", "/missing.js", "gzip"), missingResponse, next);

      // Assert
      expect(nonGetResponse.headers.size).toBe(0);
      expect(missingResponse.headers.size).toBe(0);
    });

    it("should serve a compressed HEAD response with content metadata", async () => {
      // Arrange
      const directory = await directoryWithAsset();
      await writeFile(path.join(directory, "app.js.gz"), "compressed");
      const compressor = new StaticPreCompress({ publicDir: directory });
      const res = response();

      // Act
      await compressor.middleware()(request("HEAD", "/app.js", "gzip"), res, () => undefined);

      // Assert
      expect(res.headers.get("vary")).toBe("Accept-Encoding");
      expect(res.headers.get("content-encoding")).toBe("gzip");
      expect(res.headers.get("content-type")).toBe("application/javascript; charset=utf-8");
      expect(res.headers.get("content-length")).toBe(10);
      expect(res.statusCode).toBe(200);
    });

    it("should call next when the source exists but no compressed variant is available", async () => {
      // Arrange
      const directory = await directoryWithAsset();
      const compressor = new StaticPreCompress({ publicDir: directory });
      const res = response();
      let nextCalls = 0;

      // Act
      await compressor.middleware()(request("GET", "/app.js", "gzip"), res, () => { nextCalls += 1; });

      // Assert
      expect(nextCalls).toBe(1);
      expect(res.headers.get("vary")).toBe("Accept-Encoding");
    });
  });
});
