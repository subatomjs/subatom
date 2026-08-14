/// <reference types="node" />
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import zlib from "node:zlib";

import { once } from "node:events";

import {
  SubatomCompression,
  createCompression,
  type CompressionAlgorithm,
  type CompressionOptions,
} from "../package/core/http/compression/index.js";

/**
 * ============================================================================
 * TEST CONSTANTS
 * ============================================================================
 */

const LARGE_JSON = JSON.stringify({
  data: "Subatom".repeat(5000),
});

const LARGE_TEXT = "Subatom compression test ".repeat(
  5000,
);

const SMALL_TEXT = "Hello";

/**
 * ============================================================================
 * RAW HTTP CLIENT
 *
 * Supertest/superagent may transparently decompress responses.
 *
 * For compression middleware testing we MUST inspect the actual wire bytes.
 *
 * Therefore these tests use Node's native http client.
 * ============================================================================
 */

interface RawResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

async function rawRequest(
  server: Server,
  options: {
    method?: string;
    path?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<RawResponse> {
  const address = server.address();

  if (
    !address ||
    typeof address === "string"
  ) {
    throw new Error(
      "Test server does not have a TCP address",
    );
  }

  return new Promise(
    (resolve, reject) => {
      const request =
        http.request(
          {
            host: "127.0.0.1",
            port: address.port,
            method:
              options.method ?? "GET",
            path:
              options.path ?? "/",
            headers:
              options.headers,
          },
          (response) => {
            const chunks: Buffer[] = [];

            response.on(
              "data",
              (chunk: Buffer) => {
                chunks.push(
                  Buffer.from(chunk),
                );
              },
            );

            response.on(
              "end",
              () => {
                resolve({
                  statusCode:
                    response.statusCode ??
                    0,
                  headers:
                    response.headers,
                  body: Buffer.concat(
                    chunks,
                  ),
                });
              },
            );

            response.on(
              "error",
              reject,
            );
          },
        );

      request.on(
        "error",
        reject,
      );

      request.end();
    },
  );
}

/**
 * ============================================================================
 * SERVER HELPERS
 * ============================================================================
 */

async function listen(
  server: Server,
): Promise<void> {
  server.listen(0, "127.0.0.1");

  await once(server, "listening");
}

async function closeServer(
  server: Server | undefined,
): Promise<void> {
  if (!server) {
    return;
  }

  if (!server.listening) {
    return;
  }

  await new Promise<void>(
    (resolve) => {
      server.close(() => resolve());
    },
  );
}

/**
 * ============================================================================
 * DECOMPRESSION HELPERS
 * ============================================================================
 */

async function decompressResponse(
  algorithm: CompressionAlgorithm,
  body: Buffer,
): Promise<Buffer> {
  switch (algorithm) {
    case "br":
      return new Promise(
        (resolve, reject) => {
          zlib.brotliDecompress(
            body,
            (error, result) => {
              if (error) {
                reject(error);
                return;
              }

              resolve(result);
            },
          );
        },
      );

    case "gzip":
      return new Promise(
        (resolve, reject) => {
          zlib.gunzip(
            body,
            (error, result) => {
              if (error) {
                reject(error);
                return;
              }

              resolve(result);
            },
          );
        },
      );

    case "deflate":
      return new Promise(
        (resolve, reject) => {
          zlib.inflate(
            body,
            (error, result) => {
              if (error) {
                reject(error);
                return;
              }

              resolve(result);
            },
          );
        },
      );

    case "identity":
      return body;
  }
}

/**
 * ============================================================================
 * CONTENT-LENGTH HELPERS
 * ============================================================================
 */

function contentLength(
  response: RawResponse,
): number | undefined {
  const value =
    response.headers[
      "content-length"
    ];

  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : undefined;
}

/**
 * ============================================================================
 * TEST SERVER
 * ============================================================================
 */

function createTestServer(
  options: CompressionOptions = {},
): Server {
  const compression =
    createCompression(options);

  return http.createServer(
    (
      req: IncomingMessage,
      res: ServerResponse,
    ) => {
      compression(
        req,
        res,
        () => {
          switch (req.url) {
            case "/json":
              res.statusCode = 200;

              res.setHeader(
                "Content-Type",
                "application/json; charset=utf-8",
              );

              res.end(
                LARGE_JSON,
              );
              return;

            case "/text":
              res.statusCode = 200;

              res.setHeader(
                "Content-Type",
                "text/plain; charset=utf-8",
              );

              res.end(
                LARGE_TEXT,
              );
              return;

            case "/small":
              res.statusCode = 200;

              res.setHeader(
                "Content-Type",
                "text/plain; charset=utf-8",
              );

              res.setHeader(
                "Content-Length",
                Buffer.byteLength(
                  SMALL_TEXT,
                ),
              );

              res.end(
                SMALL_TEXT,
              );
              return;

            case "/html":
              res.statusCode = 200;

              res.setHeader(
                "Content-Type",
                "text/html; charset=utf-8",
              );

              res.end(
                `<html><body>${LARGE_TEXT}</body></html>`,
              );
              return;

            case "/xml":
              res.statusCode = 200;

              res.setHeader(
                "Content-Type",
                "application/xml",
              );

              res.end(
                `<root>${LARGE_TEXT}</root>`,
              );
              return;

            case "/png":
              res.statusCode = 200;

              res.setHeader(
                "Content-Type",
                "image/png",
              );

              res.end(
                Buffer.alloc(5000),
              );
              return;

            case "/already-encoded":
              res.statusCode = 200;

              res.setHeader(
                "Content-Type",
                "text/plain",
              );

              res.setHeader(
                "Content-Encoding",
                "gzip",
              );

              res.end(
                LARGE_TEXT,
              );
              return;

            case "/cookie":
              res.statusCode = 200;

              res.setHeader(
                "Content-Type",
                "application/json",
              );

              res.setHeader(
                "Set-Cookie",
                "session=secret",
              );

              res.end(
                JSON.stringify({
                  secret:
                    "very-secret".repeat(
                      1000,
                    ),
                }),
              );
              return;

            case "/csrf":
              res.statusCode = 200;

              res.setHeader(
                "Content-Type",
                "application/json",
              );

              res.setHeader(
                "X-CSRF-Token",
                "super-secret-token",
              );

              res.end(
                JSON.stringify({
                  data: LARGE_TEXT,
                }),
              );
              return;

            case "/vary":
              res.statusCode = 200;

              res.setHeader(
                "Vary",
                "User-Agent",
              );

              res.setHeader(
                "Content-Type",
                "text/plain",
              );

              res.end(
                LARGE_TEXT,
              );
              return;

            case "/vary-lowercase":
              res.statusCode = 200;

              res.setHeader(
                "Vary",
                "user-agent, accept-encoding",
              );

              res.setHeader(
                "Content-Type",
                "text/plain",
              );

              res.end(
                LARGE_TEXT,
              );
              return;

            case "/vary-star":
              res.statusCode = 200;

              res.setHeader(
                "Vary",
                "*",
              );

              res.setHeader(
                "Content-Type",
                "text/plain",
              );

              res.end(
                LARGE_TEXT,
              );
              return;

            case "/204":
              res.statusCode = 204;
              res.end();
              return;

            case "/304":
              res.statusCode = 304;
              res.end();
              return;

            case "/head":
              res.statusCode = 200;

              res.setHeader(
                "Content-Type",
                "application/json",
              );

              res.setHeader(
                "Content-Length",
                Buffer.byteLength(
                  LARGE_JSON,
                ),
              );

              res.end(
                LARGE_JSON,
              );
              return;

            case "/stream":
              res.statusCode = 200;

              res.setHeader(
                "Content-Type",
                "text/plain",
              );

              res.write(
                "chunk-one ".repeat(
                  500,
                ),
              );

              setTimeout(() => {
                res.write(
                  "chunk-two ".repeat(
                    500,
                  ),
                );

                setTimeout(() => {
                  res.end(
                    "chunk-three ".repeat(
                      500,
                    ),
                  );
                }, 5);
              }, 5);

              return;

            case "/write-overloads":
              res.statusCode = 200;

              res.setHeader(
                "Content-Type",
                "text/plain",
              );

              res.write(
                "first",
                "utf8",
              );

              res.write(
                Buffer.from(
                  "second",
                ),
              );

              res.end(
                "third",
                "utf8",
              );

              return;

            case "/flush":
              res.statusCode = 200;

              res.setHeader(
                "Content-Type",
                "text/plain",
              );

              res.flushHeaders();

              res.end(
                LARGE_TEXT,
              );

              return;

            case "/write-head":
              res.writeHead(
                200,
                {
                  "Content-Type":
                    "application/json",
                },
              );

              res.end(
                LARGE_JSON,
              );

              return;

            default:
              res.statusCode = 404;
              res.end("Not Found");
          }
        },
      );
    },
  );
}

/**
 * ============================================================================
 * UNIT TESTS — NEGOTIATION
 * ============================================================================
 */

describe(
  "SubatomCompression - negotiation",
  () => {
    let compression: SubatomCompression;

    beforeEach(() => {
      compression =
        new SubatomCompression();
    });

    it("uses server preference when Accept-Encoding is absent", () => {
      const result =
        compression.negotiate(
          undefined,
        );

      expect(result).toEqual({
        algorithm: "br",
        qValue: 1,
        acceptable: true,
      });
    });

    it("uses identity for an explicitly empty Accept-Encoding header", () => {
      const result =
        compression.negotiate("");

      expect(result).toEqual({
        algorithm: "identity",
        qValue: 1,
        acceptable: true,
      });
    });

    it("handles whitespace-only Accept-Encoding as identity", () => {
      const result =
        compression.negotiate(
          "   ",
        );

      expect(result.algorithm).toBe(
        "identity",
      );
    });

    it("prefers Brotli when all algorithms have equal q-values", () => {
      const result =
        compression.negotiate(
          "gzip, deflate, br",
        );

      expect(result.algorithm).toBe(
        "br",
      );
    });

    it("prefers the highest client q-value", () => {
      const result =
        compression.negotiate(
          "gzip;q=1.0, br;q=0.5",
        );

      expect(result.algorithm).toBe(
        "gzip",
      );

      expect(result.qValue).toBe(1);
    });

    it("uses server preference when q-values tie", () => {
      const result =
        compression.negotiate(
          "gzip;q=0.8, br;q=0.8",
        );

      expect(result.algorithm).toBe(
        "br",
      );
    });

    it("never selects an explicitly forbidden encoding", () => {
      const result =
        compression.negotiate(
          "br;q=0, gzip;q=0.8",
        );

      expect(result.algorithm).toBe(
        "gzip",
      );
    });

    it("does not allow wildcard to override explicit q=0", () => {
      const result =
        compression.negotiate(
          "br;q=0, *;q=1",
        );

      expect(result.algorithm).not.toBe(
        "br",
      );
    });

    it("applies wildcard to unspecified algorithms", () => {
      const result =
        compression.negotiate(
          "*;q=0.5",
        );

      expect(result.algorithm).toBe(
        "br",
      );

      expect(result.qValue).toBe(
        0.5,
      );
    });

    it("respects explicit gzip over wildcard", () => {
      const result =
        compression.negotiate(
          "gzip;q=0.9, *;q=0.2",
        );

      expect(result.algorithm).toBe(
        "gzip",
      );

      expect(result.qValue).toBe(
        0.9,
      );
    });

    it("handles identity;q=0 correctly", () => {
      const result =
        compression.negotiate(
          "br;q=0, gzip;q=0, identity;q=0",
        );

      expect(result.acceptable).toBe(
        false,
      );
    });

    it("allows compression when identity is forbidden", () => {
      const result =
        compression.negotiate(
          "br;q=1, identity;q=0",
        );

      expect(result.algorithm).toBe(
        "br",
      );

      expect(result.acceptable).toBe(
        true,
      );
    });

    it("handles wildcard q=0", () => {
      const result =
        compression.negotiate(
          "*;q=0",
        );

      expect(result.algorithm).toBe(
        "identity",
      );

      expect(result.acceptable).toBe(
        false,
      );
    });

    it("allows explicit identity to override wildcard q=0", () => {
      const result =
        compression.negotiate(
          "*;q=0, identity;q=1",
        );

      expect(result.algorithm).toBe(
        "identity",
      );

      expect(result.acceptable).toBe(
        true,
      );
    });

    it("is case insensitive", () => {
      const result =
        compression.negotiate(
          "GZIP",
        );

      expect(result.algorithm).toBe(
        "gzip",
      );
    });

    it("accepts three decimal q-values", () => {
      const result =
        compression.negotiate(
          "gzip;q=0.800, br;q=0.500",
        );

      expect(result.algorithm).toBe(
        "gzip",
      );

      expect(result.qValue).toBe(
        0.8,
      );
    });

    it("rejects malformed q-values", () => {
      const result =
        compression.negotiate(
          "gzip;q=abc, br;q=0.8",
        );

      expect(result.algorithm).toBe(
        "br",
      );
    });

    it("rejects q-values above 1", () => {
      const result =
        compression.negotiate(
          "gzip;q=1.1, br;q=0.8",
        );

      expect(result.algorithm).toBe(
        "br",
      );
    });

    it("rejects q-values with more than three decimal digits", () => {
      const result =
        compression.negotiate(
          "gzip;q=0.1234, br;q=0.8",
        );

      expect(result.algorithm).toBe(
        "br",
      );
    });

    it("supports custom server algorithm order", () => {
      const custom =
        new SubatomCompression({
          algorithms: [
            "gzip",
            "br",
            "deflate",
          ],
        });

      const result =
        custom.negotiate(
          "gzip, br",
        );

      expect(result.algorithm).toBe(
        "gzip",
      );
    });

    it("falls back to identity when configured algorithms are unsupported", () => {
      const custom =
        new SubatomCompression({
          algorithms: [
            "gzip",
          ],
        });

      const result =
        custom.negotiate(
          "br;q=1",
        );

      expect(result.algorithm).toBe(
        "identity",
      );
    });
  },
);

/**
 * ============================================================================
 * UNIT TESTS — COMPRESSIBILITY
 * ============================================================================
 */

describe(
  "SubatomCompression - isCompressible",
  () => {
    let compression: SubatomCompression;
    let req: IncomingMessage;
    let res: ServerResponse;

    beforeEach(() => {
      compression =
        new SubatomCompression();

      req = {} as IncomingMessage;

      res =
        new http.ServerResponse(
          req,
        );

      res.statusCode = 200;
    });

    it("rejects already encoded responses", () => {
      res.setHeader(
        "Content-Encoding",
        "gzip",
      );

      res.setHeader(
        "Content-Type",
        "application/json",
      );

      expect(
        compression.isCompressible(
          req,
          res,
        ),
      ).toBe(false);
    });

    it("rejects responses with sensitive Set-Cookie headers", () => {
      res.setHeader(
        "Content-Type",
        "text/html",
      );

      res.setHeader(
        "Set-Cookie",
        "session=secret",
      );

      expect(
        compression.isCompressible(
          req,
          res,
        ),
      ).toBe(false);
    });

    it("rejects responses with CSRF headers", () => {
      res.setHeader(
        "Content-Type",
        "text/html",
      );

      res.setHeader(
        "X-CSRF-Token",
        "secret",
      );

      expect(
        compression.isCompressible(
          req,
          res,
        ),
      ).toBe(false);
    });

    it("allows sensitive responses when mitigation is disabled", () => {
      const noMitigation =
        new SubatomCompression({
          enableBreachMitigation:
            false,
        });

      res.setHeader(
        "Content-Type",
        "text/html",
      );

      res.setHeader(
        "Set-Cookie",
        "session=secret",
      );

      expect(
        noMitigation.isCompressible(
          req,
          res,
        ),
      ).toBe(true);
    });

    it("rejects responses below threshold", () => {
      res.setHeader(
        "Content-Type",
        "application/json",
      );

      res.setHeader(
        "Content-Length",
        "500",
      );

      expect(
        compression.isCompressible(
          req,
          res,
        ),
      ).toBe(false);
    });

    it("allows responses at threshold", () => {
      res.setHeader(
        "Content-Type",
        "application/json",
      );

      res.setHeader(
        "Content-Length",
        "1024",
      );

      expect(
        compression.isCompressible(
          req,
          res,
        ),
      ).toBe(true);
    });

    it("allows responses larger than threshold", () => {
      res.setHeader(
        "Content-Type",
        "application/json",
      );

      res.setHeader(
        "Content-Length",
        "2048",
      );

      expect(
        compression.isCompressible(
          req,
          res,
        ),
      ).toBe(true);
    });

    it("allows streaming responses without Content-Length", () => {
      res.setHeader(
        "Content-Type",
        "text/plain",
      );

      expect(
        compression.isCompressible(
          req,
          res,
        ),
      ).toBe(true);
    });

    it("rejects unknown Content-Type", () => {
      expect(
        compression.isCompressible(
          req,
          res,
        ),
      ).toBe(false);
    });

    it("rejects non-compressible image types", () => {
      res.setHeader(
        "Content-Type",
        "image/png",
      );

      expect(
        compression.isCompressible(
          req,
          res,
        ),
      ).toBe(false);
    });

    it("accepts JSON with charset", () => {
      res.setHeader(
        "Content-Type",
        "application/json; charset=utf-8",
      );

      expect(
        compression.isCompressible(
          req,
          res,
        ),
      ).toBe(true);
    });

    it("accepts HTML", () => {
      res.setHeader(
        "Content-Type",
        "text/html; charset=utf-8",
      );

      expect(
        compression.isCompressible(
          req,
          res,
        ),
      ).toBe(true);
    });

    it("accepts SVG", () => {
      res.setHeader(
        "Content-Type",
        "image/svg+xml",
      );

      expect(
        compression.isCompressible(
          req,
          res,
        ),
      ).toBe(true);
    });

    it("supports custom MIME types", () => {
      const custom =
        new SubatomCompression({
          mimeTypes: [
            "application/custom",
          ],
        });

      res.setHeader(
        "Content-Type",
        "application/custom",
      );

      expect(
        custom.isCompressible(
          req,
          res,
        ),
      ).toBe(true);
    });

    it("supports custom shouldCompress predicate", () => {
      const custom =
        new SubatomCompression({
          shouldCompress: (
            request,
          ) =>
            request.headers[
              "x-no-compress"
            ] !== "true",
        });

      req.headers = {
        "x-no-compress": "true",
      };

      res.setHeader(
        "Content-Type",
        "text/html",
      );

      expect(
        custom.isCompressible(
          req,
          res,
        ),
      ).toBe(false);
    });

    it("rejects HEAD responses", () => {
      req.method = "HEAD";

      res.setHeader(
        "Content-Type",
        "text/html",
      );

      expect(
        compression.isCompressible(
          req,
          res,
        ),
      ).toBe(false);
    });

    it("rejects 204 responses", () => {
      res.statusCode = 204;

      res.setHeader(
        "Content-Type",
        "text/html",
      );

      expect(
        compression.isCompressible(
          req,
          res,
        ),
      ).toBe(false);
    });

    it("rejects 304 responses", () => {
      res.statusCode = 304;

      res.setHeader(
        "Content-Type",
        "text/html",
      );

      expect(
        compression.isCompressible(
          req,
          res,
        ),
      ).toBe(false);
    });
  },
);

/**
 * ============================================================================
 * INTEGRATION TESTS — ACTUAL WIRE COMPRESSION
 * ============================================================================
 */

describe(
  "SubatomCompression - HTTP integration",
  () => {
    let server:
      | Server
      | undefined;

    afterEach(
      async () => {
        await closeServer(
          server,
        );

        server = undefined;
      },
    );

    it("compresses large JSON with Brotli", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/json",
            headers: {
              "Accept-Encoding":
                "br, gzip",
            },
          },
        );

      expect(
        response.statusCode,
      ).toBe(200);

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBe("br");

      const decompressed =
        await decompressResponse(
          "br",
          response.body,
        );

      expect(
        decompressed.toString(),
      ).toBe(LARGE_JSON);
    });

    it("compresses large JSON with gzip", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/json",
            headers: {
              "Accept-Encoding":
                "gzip",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBe("gzip");

      const decompressed =
        await decompressResponse(
          "gzip",
          response.body,
        );

      expect(
        decompressed.toString(),
      ).toBe(LARGE_JSON);
    });

    it("compresses with deflate when explicitly requested", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/json",
            headers: {
              "Accept-Encoding":
                "deflate",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBe("deflate");

      const decompressed =
        await decompressResponse(
          "deflate",
          response.body,
        );

      expect(
        decompressed.toString(),
      ).toBe(LARGE_JSON);
    });

    it("does not compress small responses below threshold", async () => {
      server =
        createTestServer({
          threshold: 1024,
        });

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/small",
            headers: {
              "Accept-Encoding":
                "br, gzip",
            },
          },
        );

      expect(
        response.statusCode,
      ).toBe(200);

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBeUndefined();

      expect(
        response.body.toString(),
      ).toBe(SMALL_TEXT);
    });

    it("removes Content-Length when compression is applied", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/json",
            headers: {
              "Accept-Encoding":
                "gzip",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBe("gzip");

      expect(
        response.headers[
          "content-length"
        ],
      ).toBeUndefined();
    });

    it("does not compress image/png", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/png",
            headers: {
              "Accept-Encoding":
                "gzip, br",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBeUndefined();
    });

    it("does not double-compress an already encoded response", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/already-encoded",
            headers: {
              "Accept-Encoding":
                "br, gzip",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBe("gzip");
    });

    it("does not compress sensitive Set-Cookie responses", async () => {
      server =
        createTestServer({
          enableBreachMitigation:
            true,
        });

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/cookie",
            headers: {
              "Accept-Encoding":
                "br, gzip",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBeUndefined();

      expect(
        response.headers[
          "set-cookie"
        ],
      ).toBeDefined();
    });

    it("does not compress responses containing CSRF headers", async () => {
      server =
        createTestServer({
          enableBreachMitigation:
            true,
        });

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/csrf",
            headers: {
              "Accept-Encoding":
                "br, gzip",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBeUndefined();

      expect(
        response.headers[
          "x-csrf-token"
        ],
      ).toBeDefined();
    });

    it("supports disabling breach mitigation", async () => {
      server =
        createTestServer({
          enableBreachMitigation:
            false,
        });

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/cookie",
            headers: {
              "Accept-Encoding":
                "gzip",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBe("gzip");
    });
  },
);

/**
 * ============================================================================
 * ACCEPT-ENCODING HTTP INTEGRATION
 * ============================================================================
 */

describe(
  "SubatomCompression - Accept-Encoding HTTP semantics",
  () => {
    let server:
      | Server
      | undefined;

    afterEach(
      async () => {
        await closeServer(
          server,
        );

        server = undefined;
      },
    );

    it("honors client q-values", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/json",
            headers: {
              "Accept-Encoding":
                "gzip;q=1, br;q=0.5",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBe("gzip");
    });

    it("does not select explicitly forbidden Brotli", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/json",
            headers: {
              "Accept-Encoding":
                "br;q=0, *;q=1",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).not.toBe("br");
    });

    it("selects gzip when Brotli is forbidden", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/json",
            headers: {
              "Accept-Encoding":
                "br;q=0, gzip;q=1",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBe("gzip");
    });

    it("does not compress when client explicitly requests identity only", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/json",
            headers: {
              "Accept-Encoding":
                "identity",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBeUndefined();

      expect(
        response.body.toString(),
      ).toBe(LARGE_JSON);
    });

    it("respects identity;q=0 when compression is available", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/json",
            headers: {
              "Accept-Encoding":
                "br, identity;q=0",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBe("br");
    });

    it("returns 406 when every representation is forbidden", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/json",
            headers: {
              "Accept-Encoding":
                "br;q=0, gzip;q=0, deflate;q=0, identity;q=0",
            },
          },
        );

      expect(
        response.statusCode,
      ).toBe(406);

      expect(
        response.body.toString(),
      ).toBe("Not Acceptable");
    });

    it("uses identity for empty Accept-Encoding", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/json",
            headers: {
              "Accept-Encoding": "",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBeUndefined();

      expect(
        response.body.toString(),
      ).toBe(LARGE_JSON);
    });

    it("does not select an unsupported algorithm", async () => {
      server =
        createTestServer({
          algorithms: [
            "gzip",
          ],
        });

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/json",
            headers: {
              "Accept-Encoding":
                "br",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBeUndefined();
    });
  },
);

/**
 * ============================================================================
 * VARY TESTS
 * ============================================================================
 */

describe(
  "SubatomCompression - Vary",
  () => {
    let server:
      | Server
      | undefined;

    afterEach(
      async () => {
        await closeServer(
          server,
        );

        server = undefined;
      },
    );

    it("adds Accept-Encoding to Vary", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/json",
            headers: {
              "Accept-Encoding":
                "gzip",
            },
          },
        );

      expect(
        response.headers["vary"],
      ).toContain(
        "Accept-Encoding",
      );
    });

    it("preserves existing Vary values", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/vary",
            headers: {
              "Accept-Encoding":
                "gzip",
            },
          },
        );

      const vary =
        response.headers["vary"];

      expect(vary).toContain(
        "User-Agent",
      );

      expect(vary).toContain(
        "Accept-Encoding",
      );
    });

    it("does not duplicate Accept-Encoding", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/vary-lowercase",
            headers: {
              "Accept-Encoding":
                "gzip",
            },
          },
        );

      const vary =
        response.headers["vary"];

      expect(vary).toBe(
        "user-agent, accept-encoding",
      );
    });

    it("preserves Vary: *", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/vary-star",
            headers: {
              "Accept-Encoding":
                "gzip",
            },
          },
        );

      expect(
        response.headers["vary"],
      ).toBe("*");
    });
  },
);

/**
 * ============================================================================
 * STREAMING TESTS
 * ============================================================================
 */

describe(
  "SubatomCompression - streaming",
  () => {
    let server:
      | Server
      | undefined;

    afterEach(
      async () => {
        await closeServer(
          server,
        );

        server = undefined;
      },
    );

    it("compresses multi-chunk streaming responses", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/stream",
            headers: {
              "Accept-Encoding":
                "gzip",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBe("gzip");

      const decompressed =
        await decompressResponse(
          "gzip",
          response.body,
        );

      const text =
        decompressed.toString();

      expect(text).toContain(
        "chunk-one",
      );

      expect(text).toContain(
        "chunk-two",
      );

      expect(text).toContain(
        "chunk-three",
      );
    });

    it("preserves write overloads", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path:
              "/write-overloads",
            headers: {
              "Accept-Encoding":
                "gzip",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBe("gzip");

      const decompressed =
        await decompressResponse(
          "gzip",
          response.body,
        );

      expect(
        decompressed.toString(),
      ).toBe(
        "firstsecondthird",
      );
    });

    it("supports flushHeaders before writing the body", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/flush",
            headers: {
              "Accept-Encoding":
                "gzip",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBe("gzip");

      const decompressed =
        await decompressResponse(
          "gzip",
          response.body,
        );

      expect(
        decompressed.toString(),
      ).toBe(LARGE_TEXT);
    });

    it("supports explicit writeHead", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path:
              "/write-head",
            headers: {
              "Accept-Encoding":
                "gzip",
            },
          },
        );

      expect(
        response.statusCode,
      ).toBe(200);

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBe("gzip");

      const decompressed =
        await decompressResponse(
          "gzip",
          response.body,
        );

      expect(
        decompressed.toString(),
      ).toBe(LARGE_JSON);
    });
  },
);

/**
 * ============================================================================
 * HTTP SPECIAL RESPONSE TESTS
 * ============================================================================
 */

describe(
  "SubatomCompression - HTTP special responses",
  () => {
    let server:
      | Server
      | undefined;

    afterEach(
      async () => {
        await closeServer(
          server,
        );

        server = undefined;
      },
    );

    it("does not compress HEAD responses", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            method: "HEAD",
            path: "/head",
            headers: {
              "Accept-Encoding":
                "gzip, br",
            },
          },
        );

      expect(
        response.statusCode,
      ).toBe(200);

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBeUndefined();

      expect(
        response.body.length,
      ).toBe(0);
    });

    it("does not compress 204 responses", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/204",
            headers: {
              "Accept-Encoding":
                "gzip",
            },
          },
        );

      expect(
        response.statusCode,
      ).toBe(204);

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBeUndefined();

      expect(
        response.body.length,
      ).toBe(0);
    });

    it("does not compress 304 responses", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/304",
            headers: {
              "Accept-Encoding":
                "gzip",
            },
          },
        );

      expect(
        response.statusCode,
      ).toBe(304);

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBeUndefined();

      expect(
        response.body.length,
      ).toBe(0);
    });
  },
);

/**
 * ============================================================================
 * ACTUAL COMPRESSION INTEGRITY TESTS
 * ============================================================================
 */

describe(
  "SubatomCompression - compression integrity",
  () => {
    let server:
      | Server
      | undefined;

    afterEach(
      async () => {
        await closeServer(
          server,
        );

        server = undefined;
      },
    );

    it.each([
      "br",
      "gzip",
      "deflate",
    ] as const)(
      "produces valid %s compressed output",
      async (algorithm) => {
        server = createTestServer();

        await listen(server);

        const response = await rawRequest(server, {
          path: "/json",
          headers: {
            "Accept-Encoding": algorithm,
          },
        });

        expect(
          response.headers["content-encoding"],
        ).toBe(algorithm);

        const decompressed =
          await decompressResponse(
            algorithm,
            response.body,
          );

        expect(
          decompressed.toString(),
        ).toBe(LARGE_JSON);
      },
    );

    it("compressed response is smaller than original for highly compressible data", async () => {
      server =
        createTestServer();

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/json",
            headers: {
              "Accept-Encoding":
                "gzip",
            },
          },
        );

      expect(
        response.body.length,
      ).toBeLessThan(
        Buffer.byteLength(
          LARGE_JSON,
        ),
      );
    });
  },
);

/**
 * ============================================================================
 * CUSTOM CONFIGURATION TESTS
 * ============================================================================
 */

describe(
  "SubatomCompression - configuration",
  () => {
    let server:
      | Server
      | undefined;

    afterEach(
      async () => {
        await closeServer(
          server,
        );

        server = undefined;
      },
    );

    it("respects custom threshold", async () => {
      server =
        createTestServer({
          threshold: 1_000_000,
        });

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/json",
            headers: {
              "Accept-Encoding":
                "gzip",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBeUndefined();
    });

    it("respects custom algorithm order", async () => {
      server =
        createTestServer({
          algorithms: [
            "gzip",
            "br",
          ],
        });

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/json",
            headers: {
              "Accept-Encoding":
                "gzip, br",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBe("gzip");
    });

    it("respects custom MIME filters", async () => {
      server =
        createTestServer({
          mimeTypes: [
            "text/plain",
          ],
        });

      await listen(server);

      const response =
        await rawRequest(
          server,
          {
            path: "/json",
            headers: {
              "Accept-Encoding":
                "gzip",
            },
          },
        );

      expect(
        response.headers[
          "content-encoding"
        ],
      ).toBeUndefined();
    });
  },
);

/**
 * ============================================================================
 * DIRECT STREAM TESTS
 * ============================================================================
 */

describe(
  "SubatomCompression - compressor streams",
  () => {
    let compression: SubatomCompression;

    beforeEach(() => {
      compression =
        new SubatomCompression();
    });

    it("creates Brotli compressor", () => {
      const stream =
        compression.createCompressorStream(
          "br",
        );

      expect(stream).not.toBeNull();
      expect(
        typeof stream?.pipe,
      ).toBe("function");

      stream?.destroy();
    });

    it("creates Gzip compressor", () => {
      const stream =
        compression.createCompressorStream(
          "gzip",
        );

      expect(stream).not.toBeNull();

      stream?.destroy();
    });

    it("creates Deflate compressor", () => {
      const stream =
        compression.createCompressorStream(
          "deflate",
        );

      expect(stream).not.toBeNull();

      stream?.destroy();
    });

    it("returns null for identity", () => {
      const stream =
        compression.createCompressorStream(
          "identity",
        );

      expect(stream).toBeNull();
    });
  },
);