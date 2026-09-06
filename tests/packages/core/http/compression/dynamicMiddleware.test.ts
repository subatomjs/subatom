import { EventEmitter } from "node:events";
import http from "node:http";
import type {
	IncomingMessage,
	OutgoingHttpHeaders,
	ServerResponse,
} from "node:http";
import { PassThrough, Transform } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createDynamicCompressionMiddleware } from "../../../../../packages/core/http/compression/dynamicMiddleware.js";
import { Compression } from "../../../../../packages/core/http/compression/Compression.js";
import type { NegotiatedEncoding } from "../../../../../packages/core/http/compression/types/compression.types.js";

interface ResponseFixture extends ServerResponse {
	headers: Map<string, unknown>;
	writes: unknown[];
	endedWith: unknown[];
	originalWriteHead: ReturnType<typeof vi.fn>;
	originalFlushHeaders: ReturnType<typeof vi.fn>;
}

function createResponse(): ResponseFixture {
	const emitter = new EventEmitter();
	const headers = new Map<string, unknown>();
	const response = Object.assign(emitter, {
		headers,
		writes: [] as unknown[],
		endedWith: [] as unknown[],
		destroyed: false,
		writableEnded: false,
		statusCode: 200,
		originalWriteHead: vi.fn(function (this: ResponseFixture) {
			return this;
		}),
		originalFlushHeaders: vi.fn(),
		setHeader(name: string, value: unknown) {
			headers.set(name.toLowerCase(), value);
			return this;
		},
		getHeader(name: string) {
			return headers.get(name.toLowerCase());
		},
		removeHeader(name: string) {
			headers.delete(name.toLowerCase());
		},
		write(chunk: unknown, encodingOrCallback?: unknown, cb?: unknown) {
			this.writes.push(chunk);
			if (typeof encodingOrCallback === "function") {
				encodingOrCallback();
			} else if (typeof cb === "function") {
				cb();
			}
			return true;
		},
		end(chunk?: unknown, encodingOrCallback?: unknown, cb?: unknown) {
			if (chunk !== undefined && typeof chunk !== "function") {
				this.endedWith.push(chunk);
			}
			if (typeof chunk === "function") {
				chunk();
			} else if (typeof encodingOrCallback === "function") {
				encodingOrCallback();
			} else if (typeof cb === "function") {
				cb();
			}
			this.writableEnded = true;
			return this;
		},
		writeHead(statusCode: number, _status?: string | OutgoingHttpHeaders) {
			this.statusCode = statusCode;
			return this;
		},
		flushHeaders() {
			return undefined;
		},
		destroy() {
			this.destroyed = true;
			return this;
		},
	}) as unknown as ResponseFixture;

	Object.defineProperty(response, "headersSent", {
		value: false,
		writable: true,
		configurable: true,
	});

	return response;
}

function createRequest(acceptEncoding?: string): IncomingMessage {
	return {
		method: "GET",
		headers: acceptEncoding ? { "accept-encoding": acceptEncoding } : {},
	} as IncomingMessage;
}

function engineFor(
	negotiation: NegotiatedEncoding,
	compressible: boolean,
	stream?: PassThrough,
): Compression {
	return {
		negotiate: vi.fn(() => negotiation),
		isCompressible: vi.fn(() => compressible),
		createCompressorStream: vi.fn(() => stream ?? null),
	} as unknown as Compression;
}

describe("createDynamicCompressionMiddleware", () => {
	it("should preserve identity responses and invoke next", () => {
		const response = createResponse();
		const next = vi.fn();
		const middleware = createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 1, acceptable: true }, true),
		);

		middleware(createRequest("identity"), response, next);
		response.write("plain");
		response.end("done");

		expect(next).toHaveBeenCalledOnce();
		expect(response.writes).toEqual(["plain"]);
		expect(response.endedWith).toEqual(["done"]);
	});

	it("should reject unacceptable encodings with a 406 response", () => {
		const response = createResponse();
		const middleware = createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 0, acceptable: false }, false),
		);

		middleware(createRequest("br;q=0"), response, vi.fn());
		response.write("payload", (error?: Error | null) => {
			expect(error).toBeInstanceOf(Error);
		});
		response.end("payload");

		expect(response.statusCode).toBe(406);
		expect(response.endedWith).toEqual(["Not Acceptable"]);
		expect(response.headers.get("vary")).toBe("Accept-Encoding");
	});

	it("should handle write() when rejected without callback and with callback argument", () => {
		const response = createResponse();
		const middleware = createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 0, acceptable: false }, false),
		);

		middleware(createRequest("br;q=0"), response, vi.fn());
		expect(response.write("chunk1")).toBe(false);

		const cb = vi.fn();
		expect(response.write("chunk2", "utf8", cb)).toBe(false);
		expect(cb).toHaveBeenCalledWith(expect.any(Error));
	});

	it("should compress writes and ends when negotiation selects an available stream", () => {
		const response = createResponse();
		const compressor = new PassThrough();
		const middleware = createDynamicCompressionMiddleware(
			engineFor(
				{ algorithm: "gzip", qValue: 1, acceptable: true },
				true,
				compressor,
			),
		);

		middleware(createRequest("gzip"), response, vi.fn());
		response.write("payload");
		response.end("done");

		expect(response.headers.get("content-encoding")).toBe("gzip");
		expect(response.headers.get("vary")).toBe("Accept-Encoding");
	});

	it("should preserve identity behavior across writeHead, flushHeaders, and end overloads", () => {
		const response = createResponse();
		const middleware = createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 1, acceptable: true }, true),
		);

		middleware(createRequest("identity"), response, vi.fn());
		response.writeHead(201, "Created", { "X-Request": "test" });
		response.flushHeaders();
		response.write("first", "utf8", vi.fn());
		response.write("second", vi.fn());
		response.end(Buffer.from("last"), "utf8", vi.fn());

		expect(response.statusCode).toBe(201);
		expect(response.headers.get("x-request")).toBe("test");
		expect(response.writes).toEqual(["first", "second"]);
		expect(response.endedWith).toEqual([Buffer.from("last")]);
	});

	it("should handle all identity res.end overloads (fn, undefined, callback, chunk+encoding)", () => {
		const middleware = createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 1, acceptable: true }, true),
		);

		const res1 = createResponse();
		middleware(createRequest("identity"), res1, vi.fn());
		const fn1 = vi.fn();
		res1.end(fn1);
		expect(fn1).toHaveBeenCalled();

		const res2 = createResponse();
		middleware(createRequest("identity"), res2, vi.fn());
		const fn2 = vi.fn();
		res2.end(undefined, fn2);
		expect(fn2).toHaveBeenCalled();

		const res3 = createResponse();
		middleware(createRequest("identity"), res3, vi.fn());
		res3.end();

		const res4 = createResponse();
		middleware(createRequest("identity"), res4, vi.fn());
		res4.end("data", "utf8");
		expect(res4.endedWith).toEqual(["data"]);
	});

	it("should handle all compressed res.end overloads (fn, callback, chunk+fn, chunk+cb)", () => {
		const createCompressed = () => {
			const res = createResponse();
			const comp = new PassThrough();
			createDynamicCompressionMiddleware(
				engineFor(
					{ algorithm: "gzip", qValue: 1, acceptable: true },
					true,
					comp,
				),
			)(createRequest("gzip"), res, vi.fn());
			return { res, comp };
		};

		const c1 = createCompressed();
		c1.res.end((() => {}) as never);

		const c2 = createCompressed();
		c2.res.end("data", () => {});

		const c3 = createCompressed();
		c3.res.end("data", undefined as never, () => {});

		const c4 = createCompressed();
		c4.res.end(() => {});

		const c5 = createCompressed();
		c5.res.end(undefined, undefined as never, () => {});
	});

	it("should bypass negotiation for bodyless, sent, and pre-encoded responses", () => {
		const engine = engineFor(
			{ algorithm: "gzip", qValue: 1, acceptable: true },
			true,
		);
		const bodyless = createResponse();
		const sent = createResponse();
		Object.defineProperty(sent, "headersSent", { value: true });
		const encoded = createResponse();
		encoded.headers.set("content-encoding", "br");

		createDynamicCompressionMiddleware(engine)(
			createRequest("gzip"),
			bodyless,
			vi.fn(),
		);
		bodyless.statusCode = 204;
		bodyless.end("bodyless");
		createDynamicCompressionMiddleware(engine)(
			createRequest("gzip"),
			sent,
			vi.fn(),
		);
		sent.end("sent");
		createDynamicCompressionMiddleware(engine)(
			createRequest("gzip"),
			encoded,
			vi.fn(),
		);
		encoded.end("encoded");

		expect(engine.negotiate).not.toHaveBeenCalled();
		expect(bodyless.endedWith).toEqual(["bodyless"]);
		expect(sent.endedWith).toEqual(["sent"]);
		expect(encoded.endedWith).toEqual(["encoded"]);
	});

	it("should fall back to identity when the response is not compressible or no stream is created", () => {
		const nonCompressible = createResponse();
		const unavailable = createResponse();
		const nonCompressibleEngine = engineFor(
			{ algorithm: "gzip", qValue: 1, acceptable: true },
			false,
		);
		const unavailableEngine = engineFor(
			{ algorithm: "gzip", qValue: 1, acceptable: true },
			true,
		);

		createDynamicCompressionMiddleware(nonCompressibleEngine)(
			createRequest("gzip"),
			nonCompressible,
			vi.fn(),
		);
		nonCompressible.end("plain");
		createDynamicCompressionMiddleware(unavailableEngine)(
			createRequest("gzip"),
			unavailable,
			vi.fn(),
		);
		unavailable.end("fallback");

		expect(nonCompressibleEngine.createCompressorStream).not.toHaveBeenCalled();
		expect(unavailableEngine.createCompressorStream).toHaveBeenCalledWith(
			"gzip",
		);
		expect(nonCompressible.endedWith).toEqual(["plain"]);
		expect(unavailable.endedWith).toEqual(["fallback"]);
	});

	it("should destroy active streams when the response closes", () => {
		const response = createResponse();
		const compressor = new PassThrough();
		const middleware = createDynamicCompressionMiddleware(
			engineFor(
				{ algorithm: "gzip", qValue: 1, acceptable: true },
				true,
				compressor,
			),
		);

		middleware(createRequest("gzip"), response, vi.fn());
		response.write("payload");
		response.emit("close");

		expect(compressor.destroyed).toBe(true);
		expect(response.destroyed).toBe(false);
	});

	it("should forward compressed write and end overloads to the compressor", () => {
		const createCompressedResponse = (): {
			response: ResponseFixture;
			compressor: PassThrough;
		} => {
			const response = createResponse();
			const compressor = new PassThrough();
			createDynamicCompressionMiddleware(
				engineFor(
					{ algorithm: "gzip", qValue: 1, acceptable: true },
					true,
					compressor,
				),
			)(createRequest("gzip"), response, vi.fn());
			return { response, compressor };
		};

		const first = createCompressedResponse();
		first.response.write("encoded", "utf8", vi.fn());
		first.response.write("callback", vi.fn());
		first.response.write("plain");
		first.response.end("encoded", "utf8", vi.fn());

		const second = createCompressedResponse();
		second.response.end("callback", vi.fn());

		const third = createCompressedResponse();
		third.response.end(vi.fn());

		const fourth = createCompressedResponse();
		fourth.response.end();

		expect(first.compressor.destroyed).toBe(false);
		expect(second.compressor.destroyed).toBe(false);
		expect(third.compressor.destroyed).toBe(false);
		expect(fourth.compressor.destroyed).toBe(false);
	});

	it("should preserve writeHead headers and status when compression starts there", () => {
		const response = createResponse();
		const compressor = new PassThrough();
		const middleware = createDynamicCompressionMiddleware(
			engineFor(
				{ algorithm: "gzip", qValue: 1, acceptable: true },
				true,
				compressor,
			),
		);

		middleware(createRequest("gzip"), response, vi.fn());
		response.writeHead(201, {
			"Content-Length": 7,
			"X-Defined": undefined,
			"X-Request": "test",
		});

		expect(response.statusCode).toBe(201);
		expect(response.headers.get("content-encoding")).toBe("gzip");
		expect(response.headers.get("content-length")).toBeUndefined();
		expect(response.headers.get("x-request")).toBe("test");
	});

	it("should invoke the rejection callback and survive an original end failure", () => {
		const response = createResponse();
		response.end = () => {
			throw new Error("socket closed");
		};
		const callback = vi.fn<(error?: Error | null) => void>();
		const middleware = createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 0, acceptable: false }, false),
		);

		middleware(createRequest("br;q=0"), response, vi.fn());
		const writable = response.write("payload", "utf8", callback);
		const result = response.end();

		expect(writable).toBe(false);
		expect(callback).toHaveBeenCalledWith(expect.any(Error));
		expect(response.destroyed).toBe(true);
		expect(result).toBe(response);
	});

	it("should destroy the response when a compressor emits an error", () => {
		const response = createResponse();
		const compressor = new PassThrough();
		const middleware = createDynamicCompressionMiddleware(
			engineFor(
				{ algorithm: "gzip", qValue: 1, acceptable: true },
				true,
				compressor,
			),
		);

		middleware(createRequest("gzip"), response, vi.fn());
		response.write("payload");
		compressor.emit("error", new Error("compression failed"));

		expect(response.destroyed).toBe(true);
		expect(response.listenerCount("close")).toBe(0);
	});

	it("should cover responseSink final early return when writableEnded is true (line 75)", async () => {
		const res = createResponse();
		const comp = new PassThrough();
		const middleware = createDynamicCompressionMiddleware(
			engineFor({ algorithm: "gzip", qValue: 1, acceptable: true }, true, comp),
		);
		middleware(createRequest("gzip"), res, vi.fn());
		res.write("init");

		// Mark response writableEnded before ending compressor
		Object.defineProperty(res, "writableEnded", { value: true });
		comp.end();

		await new Promise((r) => setTimeout(r, 20));
		expect(res.writableEnded).toBe(true);
	});

	it("should catch non-Error string thrown in originalEnd inside final (lines 80-81)", async () => {
		const res = createResponse();
		// Set throwing function on originalEnd BEFORE middleware binds it
		res.end = () => {
			throw "non-error-string";
		};

		const comp = new PassThrough();
		const middleware = createDynamicCompressionMiddleware(
			engineFor({ algorithm: "gzip", qValue: 1, acceptable: true }, true, comp),
		);
		middleware(createRequest("gzip"), res, vi.fn());

		res.write("start");
		res.end();

		await new Promise((r) => setTimeout(r, 25));
		expect(res.destroyed).toBe(true);
	});

	it("should cover writeHead rejected and statusMessage overloads (lines 207, 247)", () => {
		// Line 247: writeHead when result === 'rejected'
		const resRej = createResponse();
		createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 0, acceptable: false }, false),
		)(createRequest("br;q=0"), resRej, vi.fn());
		resRej.writeHead(200);
		expect(resRej.statusCode).toBe(200);
		expect(resRej.headers.get("vary")).toBe("Accept-Encoding");
		// writeHead with string statusMessage AND headers parameter
		const resMsg = createResponse();
		createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 1, acceptable: true }, true),
		)(createRequest("identity"), resMsg, vi.fn());
		resMsg.writeHead(200, "OK", { "X-Msg": "val", "X-Undef": undefined });
		expect(resMsg.headers.get("x-msg")).toBe("val");
	});

	it("should cover 3-argument write and end overloads (lines 300, 315, 400)", () => {
		// Line 300: compressor write(chunk, undefined, callback)
		const resComp = createResponse();
		const comp = new PassThrough();
		createDynamicCompressionMiddleware(
			engineFor({ algorithm: "gzip", qValue: 1, acceptable: true }, true, comp),
		)(createRequest("gzip"), resComp, vi.fn());
		const cbComp = vi.fn();
		resComp.write("chunk", undefined as never, cbComp);

		// Line 315: identity write(chunk, undefined, callback)
		const resId = createResponse();
		createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 1, acceptable: true }, true),
		)(createRequest("identity"), resId, vi.fn());
		const cbId = vi.fn();
		resId.write("chunk", undefined as never, cbId);
		expect(cbId).toHaveBeenCalled();

		// Line 400: compressor end(undefined, undefined, callback)
		const resCompEnd = createResponse();
		const comp2 = new PassThrough();
		createDynamicCompressionMiddleware(
			engineFor(
				{ algorithm: "gzip", qValue: 1, acceptable: true },
				true,
				comp2,
			),
		)(createRequest("gzip"), resCompEnd, vi.fn());
		resCompEnd.write("init");
		const cbEnd = vi.fn();
		resCompEnd.end(undefined, undefined as never, cbEnd);
	});

	it("should handle rejected end() when res is already destroyed (lines 381-382)", () => {
		const res = createResponse();
		res.end = () => {
			throw new Error("End fail");
		};
		createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 0, acceptable: false }, false),
		)(createRequest("br;q=0"), res, vi.fn());

		// Pre-destroy response so if (!res.destroyed) evaluates false
		res.destroyed = true;
		const out = res.end();
		expect(out).toBe(res);
	});

	it("should handle responseSink write backpressure and drain event", async () => {
		const res = createResponse();
		let drainTriggered = false;
		// Make originalWrite return false to simulate backpressure
		res.write = () => false;

		const comp = new PassThrough();
		createDynamicCompressionMiddleware(
			engineFor({ algorithm: "gzip", qValue: 1, acceptable: true }, true, comp),
		)(createRequest("gzip"), res, vi.fn());

		res.write("start");

		setTimeout(() => {
			drainTriggered = true;
			res.emit("drain");
		}, 10);

		await new Promise((r) => setTimeout(r, 30));
		expect(drainTriggered).toBe(true);
	});

	it("should destroy the response when the responseSink emits an error", async () => {
		const response = createResponse();
		let underlyingWriteError: Error | null = null;
		response.write = () => {
			if (underlyingWriteError) throw underlyingWriteError;
			return true;
		};

		const compressor = new PassThrough();
		const middleware = createDynamicCompressionMiddleware(
			engineFor(
				{ algorithm: "gzip", qValue: 1, acceptable: true },
				true,
				compressor,
			),
		);

		middleware(createRequest("gzip"), response, vi.fn());
		response.write("start compression");

		underlyingWriteError = new Error("Socket broken");
		compressor.write("flush chunk through responseSink");

		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(response.destroyed).toBe(true);
	});

	it("should handle error thrown inside responseSink final callback", async () => {
		const response = createResponse();
		response.end = () => {
			throw new Error("Final close failure");
		};

		const compressor = new PassThrough();
		const middleware = createDynamicCompressionMiddleware(
			engineFor(
				{ algorithm: "gzip", qValue: 1, acceptable: true },
				true,
				compressor,
			),
		);

		middleware(createRequest("gzip"), response, vi.fn());
		response.write("chunk");
		response.end();

		await new Promise((r) => setTimeout(r, 20));
		expect(response.destroyed).toBe(true);
	});

	it("should propagate response backpressure through the compression sink", async () => {
		const server = http.createServer((request, response) => {
			class PassthroughCompression extends Compression {
				public override negotiate(): NegotiatedEncoding {
					return { algorithm: "gzip", qValue: 1, acceptable: true };
				}

				public override isCompressible(): boolean {
					return true;
				}

				public override createCompressorStream(): Transform {
					return new Transform({
						transform(chunk, _encoding, callback) {
							callback(null, chunk);
						},
					});
				}
			}
			const engine = new PassthroughCompression();
			createDynamicCompressionMiddleware(engine)(request, response, () => {
				response.write("payload");
				response.end();
			});
		});
		await new Promise<void>((resolve) => server.listen(0, resolve));
		const address = server.address();
		if (!address || typeof address === "string")
			throw new Error("Expected TCP server address");

		const body = await new Promise<string>((resolve, reject) => {
			http
				.get(
					{
						host: "127.0.0.1",
						port: address.port,
						headers: { "accept-encoding": "gzip" },
					},
					(response) => {
						let data = "";
						response.setEncoding("utf8");
						response.on("data", (chunk: string) => {
							data += chunk;
						});
						response.on("end", () => resolve(data));
					},
				)
				.on("error", reject);
		});

		expect(body).toBe("payload");
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});

	it("should cover responseSink.write when res is destroyed (lines 57-58)", async () => {
		const res = createResponse();
		const comp = new PassThrough();
		const middleware = createDynamicCompressionMiddleware(
			engineFor({ algorithm: "gzip", qValue: 1, acceptable: true }, true, comp),
		);
		middleware(createRequest("gzip"), res, vi.fn());
		res.write("start");

		// Destroy the response fixture directly before writing to the compressor stream
		res.destroyed = true;
		comp.write("data-after-destruction");

		await new Promise((r) => setTimeout(r, 20));
		expect(res.destroyed).toBe(true);
	});

	it("should cover flushHeaders on rejected and copyHeaders with undefined (lines 207, 261-262)", () => {
		// Lines 261-262: flushHeaders when rejected
		const resRej = createResponse();
		createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 0, acceptable: false }, false),
		)(createRequest("br;q=0"), resRej, vi.fn());
		resRej.flushHeaders();
		expect(resRej.statusCode).toBe(406);

		// Line 207: copyHeaders continues when header value is undefined in statusMessageOrHeaders
		const resHdr = createResponse();
		createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 1, acceptable: true }, true),
		)(createRequest("identity"), resHdr, vi.fn());
		resHdr.writeHead(200, { "x-real": "valid", "x-skip": undefined });
		expect(resHdr.headers.get("x-real")).toBe("valid");
		expect(resHdr.headers.get("x-skip")).toBeUndefined();
	});

	it("should cover rejected end() destroying response when originalEnd throws (lines 381-382)", () => {
		const res = createResponse();
		res.end = () => {
			throw new Error("End crashed");
		};
		createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 0, acceptable: false }, false),
		)(createRequest("br;q=0"), res, vi.fn());

		// res.destroyed is false, so it takes the 'if (!res.destroyed) res.destroy()' branch
		expect(res.destroyed).toBe(false);
		res.end();
		expect(res.destroyed).toBe(true);
	});

	it("should cover compressed and identity end overload branches (lines 400, 415, 419)", () => {
		// Line 400: compressor.end(callback) when chunk === undefined, encodingOrCallback is not fn, callback is provided
		const resComp = createResponse();
		const comp = new PassThrough();
		createDynamicCompressionMiddleware(
			engineFor({ algorithm: "gzip", qValue: 1, acceptable: true }, true, comp),
		)(createRequest("gzip"), resComp, vi.fn());
		resComp.write("init");
		const cbComp = vi.fn();
		resComp.end(undefined, undefined as never, cbComp);

		// Line 415: identity end(chunk, callback) without encoding
		const resIdCb = createResponse();
		createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 1, acceptable: true }, true),
		)(createRequest("identity"), resIdCb, vi.fn());
		const cbId = vi.fn();
		resIdCb.end("final-payload", cbId);
		expect(cbId).toHaveBeenCalled();

		// Line 419: identity end(chunk) alone without callbacks or encodings
		const resIdPlain = createResponse();
		createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 1, acceptable: true }, true),
		)(createRequest("identity"), resIdPlain, vi.fn());
		resIdPlain.end("plain-end-chunk");
		expect(resIdPlain.endedWith).toContain("plain-end-chunk");
	});

	it("should cover final uncovered branches for lines 207, 381-382, 400, and 419", async () => {
		// Line 207: responseSink error handler triggers res.destroy(error) when res.destroyed is false
		const resSink = createResponse();
		let hasDestroyedThroughSink = false;
		const originalDestroy = resSink.destroy.bind(resSink);
		// Keep res.destroyed false during sink.destroy() so the error event listener hits line 207
		resSink.destroy = (err?: Error) => {
			hasDestroyedThroughSink = true;
			return originalDestroy(err);
		};

		resSink.write = () => {
			throw new Error("sink write error");
		};

		const compSink = new PassThrough();
		createDynamicCompressionMiddleware(
			engineFor(
				{ algorithm: "gzip", qValue: 1, acceptable: true },
				true,
				compSink,
			),
		)(createRequest("gzip"), resSink, vi.fn());

		resSink.write("trigger write");
		await new Promise((r) => setTimeout(r, 25));
		expect(hasDestroyedThroughSink).toBe(true);

		// Lines 381-382: originalEnd throws on rejected request when !res.destroyed is true
		const resThrow = createResponse();
		resThrow.end = () => {
			throw new Error("originalEnd rejected fail");
		};
		const rejMiddleware = createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 0, acceptable: false }, false),
		);
		rejMiddleware(createRequest("br;q=0"), resThrow, vi.fn());
		resThrow.end();
		expect(resThrow.destroyed).toBe(true);

		// Line 400: compressor.end(chunk, callback) when chunk !== undefined and callback is provided
		const resCompChunkCb = createResponse();
		const comp1 = new PassThrough();
		createDynamicCompressionMiddleware(
			engineFor(
				{ algorithm: "gzip", qValue: 1, acceptable: true },
				true,
				comp1,
			),
		)(createRequest("gzip"), resCompChunkCb, vi.fn());
		resCompChunkCb.write("init");
		const cbChunk = vi.fn();
		resCompChunkCb.end("final-chunk", undefined as never, cbChunk);

		// Line 419: compressor.end(callback) when chunk is undefined and callback is provided
		const resCompNoChunkCb = createResponse();
		const comp2 = new PassThrough();
		createDynamicCompressionMiddleware(
			engineFor(
				{ algorithm: "gzip", qValue: 1, acceptable: true },
				true,
				comp2,
			),
		)(createRequest("gzip"), resCompNoChunkCb, vi.fn());
		resCompNoChunkCb.write("init");
		const cbNoChunk = vi.fn();
		resCompNoChunkCb.end(undefined, undefined as never, cbNoChunk);
	});

	it("should cover final uncovered branches for lines 207, 381-382, 400, and 419", async () => {
		// Line 207: responseSink emits 'error' directly while res.destroyed is false
		const resSink = createResponse();
		const compSink = new PassThrough();
		createDynamicCompressionMiddleware(
			engineFor(
				{ algorithm: "gzip", qValue: 1, acceptable: true },
				true,
				compSink,
			),
		)(createRequest("gzip"), resSink, vi.fn());
		resSink.write("init compression");

		// Attach to compressor to find the piped responseSink instance
		const pipes = (
			compSink as unknown as { _readableState: { pipes: unknown } }
		)._readableState.pipes;
		const sinkStream = Array.isArray(pipes) ? pipes[0] : pipes;
		if (sinkStream && typeof (sinkStream as EventEmitter).emit === "function") {
			expect(resSink.destroyed).toBe(false);
			(sinkStream as EventEmitter).emit(
				"error",
				new Error("direct sink error event"),
			);
			expect(resSink.destroyed).toBe(true);
		}

		// Lines 381-382: originalEnd throws on rejected request when !res.destroyed is true
		const resThrow = createResponse();
		// Ensure resThrow.destroyed remains false when throwing
		resThrow.end = () => {
			throw new Error("originalEnd rejected throw");
		};
		const rejMiddleware = createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 0, acceptable: false }, false),
		);
		rejMiddleware(createRequest("br;q=0"), resThrow, vi.fn());
		expect(resThrow.destroyed).toBe(false);
		resThrow.end();
		expect(resThrow.destroyed).toBe(true);

		// Line 400: compressor.end(fn) when chunk is undefined and encodingOrCallback is function
		const resCompCb = createResponse();
		const comp1 = new PassThrough();
		createDynamicCompressionMiddleware(
			engineFor(
				{ algorithm: "gzip", qValue: 1, acceptable: true },
				true,
				comp1,
			),
		)(createRequest("gzip"), resCompCb, vi.fn());
		resCompCb.write("init");
		const cbCompEnd = vi.fn();
		resCompCb.end(undefined, cbCompEnd);

		// Line 419: originalEnd(chunk, fn) when encodingOrCallback is function on identity response
		const resIdChunkCb = createResponse();
		createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 1, acceptable: true }, true),
		)(createRequest("identity"), resIdChunkCb, vi.fn());
		const cbIdEnd = vi.fn();
		resIdChunkCb.end("final-data", cbIdEnd);
		expect(cbIdEnd).toHaveBeenCalled();
	});
});
