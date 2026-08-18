import { Buffer } from "node:buffer";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import zlib from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { SubatomCompression } from "../../../package/core/http/compression/compressor.js";
import { createDynamicCompressionMiddleware } from "../../../package/core/http/compression/dynamicMiddleware.js";

describe("dynamicMiddleware.ts - Comprehensive Unit Tests", () => {
    const setup = (
        options = {},
        reqHeaders: Record<string, string | undefined> = { "accept-encoding": "gzip" },
        method: string = "GET",
    ) => {
        const engine = new SubatomCompression(options);
        const middleware = createDynamicCompressionMiddleware(engine);
        const socket = new Socket();
        const req = new IncomingMessage(socket);
        req.method = method;
        req.headers = { ...reqHeaders } as any;
        const res = new ServerResponse(req);

        (res as any)._writeRaw = (_data: any, _encoding: any, cb: any) => {
            if (typeof cb === "function") cb();
            return true;
        };

        return { engine, middleware, req, res, socket };
    };

    describe("Middleware Initialization & next()", () => {
        it("calls next() synchronously upon middleware invocation", () => {
            const { middleware, req, res } = setup();
            const next = vi.fn();
            middleware(req, res, next);
            expect(next).toHaveBeenCalledOnce();
        });
    });

    describe("initialize() Early-Returns & State Idempotency", () => {
        it("returns early from initialize if state is already compressing", () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "gzip" });
            middleware(req, res, () => {});

            res.setHeader("Content-Type", "text/plain");
            res.write("Chunk 1");
            res.write("Chunk 2");
            res.end();
            expect(res.getHeader("Content-Encoding")).toBe("gzip");
        });

        it("returns early from initialize if state is already identity", () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "identity" });
            middleware(req, res, () => {});

            res.setHeader("Content-Type", "text/plain");
            res.write("small");
            res.write("small2");
            res.end();
            expect(res.getHeader("Content-Encoding")).toBeUndefined();
        });

        it("returns early from initialize if state is already rejected", () => {
            const { middleware, req, res } = setup({}, { "accept-encoding": "identity;q=0, *;q=0" });
            middleware(req, res, () => {});

            const cb1 = vi.fn();
            const cb2 = vi.fn();
            res.write("first", cb1);
            res.write("second", cb2);

            expect(cb1).toHaveBeenCalledWith(expect.any(Error));
            expect(cb2).toHaveBeenCalledWith(expect.any(Error));
        });

        it("bypasses compression when headersSent is already true", () => {
            const { middleware, req, res } = setup();
            res.end = (() => res) as unknown as ServerResponse["end"];
            middleware(req, res, () => {});

            Object.defineProperty(res, "headersSent", { value: true, writable: true });
            res.setHeader("Content-Type", "text/plain");

            res.end("Uncompressed chunk");
            expect(res.getHeader("Content-Encoding")).toBeUndefined();
        });

        it("bypasses compression for bodyless responses (HEAD method)", () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "gzip" }, "HEAD");
            middleware(req, res, () => {});

            res.setHeader("Content-Type", "text/plain");
            res.end("test");
            expect(res.getHeader("Content-Encoding")).toBeUndefined();
        });

        it("bypasses compression for 204 No Content status code", () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "gzip" });
            middleware(req, res, () => {});

            res.statusCode = 204;
            res.setHeader("Content-Type", "text/plain");
            res.end();
            expect(res.getHeader("Content-Encoding")).toBeUndefined();
        });

        it("bypasses compression when Content-Encoding is already set manually", () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "gzip" });
            middleware(req, res, () => {});

            res.setHeader("Content-Encoding", "br");
            res.setHeader("Content-Type", "text/plain");
            res.end("pre-compressed data");

            expect(res.getHeader("Content-Encoding")).toBe("br");
        });

        it("handles undefined or missing accept-encoding header gracefully", () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": undefined });
            middleware(req, res, () => {});

            res.setHeader("Content-Type", "text/plain");
            res.end("uncompressed default response");

            expect(res.getHeader("Vary")).toBe("Accept-Encoding");
        });

        it("bypasses compression when negotiated algorithm is identity", () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "identity" });
            middleware(req, res, () => {});

            res.setHeader("Content-Type", "text/plain");
            res.end("identity response");

            expect(res.getHeader("Vary")).toBe("Accept-Encoding");
            expect(res.getHeader("Content-Encoding")).toBeUndefined();
        });

        it("bypasses compression when engine.createCompressorStream returns null", () => {
            const { engine, middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "gzip" });
            vi.spyOn(engine, "createCompressorStream").mockReturnValue(null);

            middleware(req, res, () => {});
            res.setHeader("Content-Type", "text/plain");
            res.end("sample content");

            expect(res.getHeader("Content-Encoding")).toBeUndefined();
        });
    });

    describe("writeHead() & flushHeaders()", () => {
        it("handles writeHead with status code and string status message", () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "gzip" });
            res.writeHead = vi.fn((code: number) => {
                res.statusCode = code;
                return res;
            }) as any;

            middleware(req, res, () => {});
            res.writeHead(200, "OK Status Message");

            expect(res.statusCode).toBe(200);
        });

        it("handles writeHead with status code and headers object containing undefined values", () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "gzip" });
            res.writeHead = vi.fn((code: number) => {
                res.statusCode = code;
                return res;
            }) as any;

            middleware(req, res, () => {});
            res.writeHead(201, {
                "content-type": "application/json",
                "x-defined": "123",
                "x-ignored": undefined,
            });

            expect(res.statusCode).toBe(201);
            expect(res.getHeader("x-defined")).toBe("123");
            expect(res.getHeader("x-ignored")).toBeUndefined();
        });

        it("handles writeHead with status code, message, and explicit 3rd argument headers", () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "gzip" });
            res.writeHead = vi.fn((code: number) => {
                res.statusCode = code;
                return res;
            }) as any;

            middleware(req, res, () => {});
            res.writeHead(202, "Accepted", {
                "x-job-id": "999",
                "content-type": "text/plain",
            });

            expect(res.statusCode).toBe(202);
            expect(res.getHeader("x-job-id")).toBe("999");
        });

        it("handles writeHead when negotiation is rejected", () => {
            const { middleware, req, res } = setup({}, { "accept-encoding": "identity;q=0, *;q=0" });
            const writeHeadSpy = vi.spyOn(res, "writeHead");

            middleware(req, res, () => {});
            res.writeHead(200);

            expect(writeHeadSpy).toHaveBeenCalled();
        });

        it("handles flushHeaders when negotiation is rejected", () => {
            const { middleware, req, res } = setup({}, { "accept-encoding": "identity;q=0, *;q=0" });
            res.flushHeaders = vi.fn();

            middleware(req, res, () => {});
            res.flushHeaders();

            expect(res.statusCode).toBe(406);
        });

        it("handles flushHeaders when compression is active", () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "gzip" });
            res.flushHeaders = vi.fn();

            middleware(req, res, () => {});
            res.setHeader("Content-Type", "text/plain");
            res.flushHeaders();

            expect(res.getHeader("Content-Encoding")).toBe("gzip");
        });
    });

    describe("res.write() Overloads and Edge Paths", () => {
        it("supports res.write(chunk) with no callbacks in compressing mode", () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "gzip" });
            middleware(req, res, () => {});

            res.setHeader("Content-Type", "text/plain");
            const result = res.write("sample chunk");
            expect(typeof result).toBe("boolean");
            res.end();
        });

        it("supports res.write(chunk, cb) in compressing mode", async () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "gzip" });
            middleware(req, res, () => {});
            res.setHeader("Content-Type", "text/plain");

            await new Promise<void>((resolve) => {
                res.write("sample chunk", () => {
                    resolve();
                });
                res.end();
            });
        });

        it("supports res.write(chunk, encoding) and res.write(chunk, encoding, cb) in compressing mode", async () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "gzip" });
            middleware(req, res, () => {});
            res.setHeader("Content-Type", "text/plain");

            await new Promise<void>((resolve) => {
                res.write("chunk 1", "utf8");
                res.write("chunk 2", "utf8", () => {
                    resolve();
                });
                res.end();
            });
        });

        it("supports res.write() in identity mode with various overloads", () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "identity" });
            middleware(req, res, () => {});

            res.setHeader("Content-Type", "text/plain");
            const cb1 = vi.fn();
            const cb2 = vi.fn();

            res.write("chunk a", cb1);
            res.write("chunk b", "utf8");
            res.write("chunk c", "utf8", cb2);
            res.write("chunk d");
            res.end();

            expect(cb1).toHaveBeenCalled();
            expect(cb2).toHaveBeenCalled();
        });

        it("routes error callback to 3rd arg callback if 2nd arg is encoding on rejection", () => {
            const { middleware, req, res } = setup({}, { "accept-encoding": "identity;q=0, *;q=0" });
            middleware(req, res, () => {});

            const cb = vi.fn();
            res.write("chunk", "utf8", cb);
            expect(cb).toHaveBeenCalledWith(expect.any(Error));
        });
    });

    describe("res.end() Overloads and Edge Paths", () => {
        it("handles res.end() without arguments in compressing mode", () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "gzip" });
            middleware(req, res, () => {});

            res.setHeader("Content-Type", "text/plain");
            res.write("data");
            expect(() => res.end()).not.toThrow();
        });

        it("handles res.end(cb) in compressing mode", async () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "gzip" });
            middleware(req, res, () => {});

            res.setHeader("Content-Type", "text/plain");
            res.write("data");

            await new Promise<void>((resolve) => {
                res.end(() => {
                    resolve();
                });
            });
        });

        it("handles res.end(chunk, cb) in compressing mode", async () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "gzip" });
            middleware(req, res, () => {});

            res.setHeader("Content-Type", "text/plain");

            await new Promise<void>((resolve) => {
                res.end("final chunk", () => {
                    resolve();
                });
            });
        });

        it("handles res.end(chunk, encoding, cb) in compressing mode", async () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "gzip" });
            middleware(req, res, () => {});

            res.setHeader("Content-Type", "text/plain");

            await new Promise<void>((resolve) => {
                res.end("final payload", "utf8", () => {
                    resolve();
                });
            });
        });

        it("handles res.end(fnChunk) in compressing mode", async () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "gzip" });
            middleware(req, res, () => {});

            res.setHeader("Content-Type", "text/plain");
            res.write("prefix");

            await new Promise<void>((resolve) => {
                res.end(resolve as any);
            });
        });

        it("handles res.end() signatures in identity mode on isolated instances", async () => {
            // 1. end(cb)
            const setup1 = setup({ threshold: 0 }, { "accept-encoding": "identity" });
            setup1.middleware(setup1.req, setup1.res, () => {});
            setup1.res.setHeader("Content-Type", "text/plain");
            await new Promise<void>((resolve) => {
                setup1.res.end(() => resolve());
            });

            // 2. end(chunk, cb)
            const setup2 = setup({ threshold: 0 }, { "accept-encoding": "identity" });
            setup2.middleware(setup2.req, setup2.res, () => {});
            setup2.res.setHeader("Content-Type", "text/plain");
            await new Promise<void>((resolve) => {
                setup2.res.end("uncompressed", () => resolve());
            });

            // 3. end(chunk, encoding, cb)
            const setup3 = setup({ threshold: 0 }, { "accept-encoding": "identity" });
            setup3.middleware(setup3.req, setup3.res, () => {});
            setup3.res.setHeader("Content-Type", "text/plain");
            await new Promise<void>((resolve) => {
                setup3.res.end("uncompressed", "utf8", () => resolve());
            });

            // 4. end(fnChunk)
            const setup4 = setup({ threshold: 0 }, { "accept-encoding": "identity" });
            setup4.middleware(setup4.req, setup4.res, () => {});
            setup4.res.setHeader("Content-Type", "text/plain");
            await new Promise<void>((resolve) => {
                setup4.res.end(resolve as any);
            });
        });

        it("catches errors in rejected res.end() and destroys res if not already destroyed", () => {
            const { middleware, req, res } = setup({}, { "accept-encoding": "identity;q=0, *;q=0" });
            const destroySpy = vi.spyOn(res, "destroy");
            res.end = vi.fn(() => {
                throw new Error("End write failed");
            }) as any;

            middleware(req, res, () => {});
            res.end("Test body");

            expect(destroySpy).toHaveBeenCalled();
        });
    });

    describe("createResponseSink Stream Implementation Details", () => {
        it("handles stream teardown and socket close cleanly", () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "gzip" });

            middleware(req, res, () => {});
            res.setHeader("Content-Type", "text/plain");
            res.write("Trigger pipeline");

            expect(() => res.emit("close")).not.toThrow();
        });

        it("handles res.destroy in sink destroy method", () => {
            const { middleware, req, res } = setup({ threshold: 0 }, { "accept-encoding": "gzip" });
            middleware(req, res, () => {});

            res.setHeader("Content-Type", "text/plain");
            res.write("Hello");

            const destroySpy = vi.spyOn(res, "destroy");
            res.destroy(new Error("Manual destruction"));

            expect(destroySpy).toHaveBeenCalled();
        });
    });

    describe("Full Dynamic Compression with Gzip/Brotli Verification", () => {
        it("compresses and decompresses payload correctly via gzip", async () => {
            const { middleware, req, res } = setup({ threshold: 10 }, { "accept-encoding": "gzip" });
            const chunks: Buffer[] = [];

            res.write = ((chunk: any, encodingOrCallback?: any, cb?: any) => {
                if (chunk) {
                    chunks.push(
                        Buffer.isBuffer(chunk)
                            ? chunk
                            : Buffer.from(
                                    chunk,
                                    typeof encodingOrCallback === "string"
                                        ? (encodingOrCallback as BufferEncoding)
                                        : undefined,
                                ),
                    );
                }
                if (typeof encodingOrCallback === "function") encodingOrCallback();
                if (typeof cb === "function") cb();
                return true;
            }) as any;

            const body = "This is dynamic compression content exceeding the minimum byte threshold.";

            await new Promise<void>((resolve) => {
                res.end = ((chunk?: any, encodingOrCallback?: any, cb?: any) => {
                    if (chunk && typeof chunk !== "function") {
                        chunks.push(
                            Buffer.isBuffer(chunk)
                                ? chunk
                                : Buffer.from(
                                        chunk,
                                        typeof encodingOrCallback === "string"
                                            ? (encodingOrCallback as BufferEncoding)
                                            : undefined,
                                    ),
                        );
                    }
                    const done =
                        typeof chunk === "function"
                            ? chunk
                            : typeof encodingOrCallback === "function"
                                ? encodingOrCallback
                                : cb;
                    if (done) done();
                    resolve();
                    return res;
                }) as any;

                middleware(req, res, () => {});
                res.setHeader("Content-Type", "text/plain");
                res.write(body, "utf8", () => {
                    res.end();
                });
            });

            expect(res.getHeader("Content-Encoding")).toBe("gzip");
            const decompressed = zlib.gunzipSync(Buffer.concat(chunks)).toString("utf8");
            expect(decompressed).toBe(body);
        });
    });
});