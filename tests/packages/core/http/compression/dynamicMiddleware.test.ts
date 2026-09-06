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
		headersSent: false,
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
		write(chunk: unknown) {
			this.writes.push(chunk);
			return true;
		},
		end(chunk?: unknown) {
			if (chunk !== undefined) this.endedWith.push(chunk);
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
		destroy(error?: Error) {
			this.destroyed = true;
			return this;
		},
	}) as unknown as ResponseFixture;
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
		// Arrange
		const response = createResponse();
		const next = vi.fn();
		const middleware = createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 1, acceptable: true }, true),
		);

		// Act
		middleware(createRequest("identity"), response, next);
		response.write("plain");
		response.end("done");

		// Assert
		expect(next).toHaveBeenCalledOnce();
		expect(response.writes).toEqual(["plain"]);
		expect(response.endedWith).toEqual(["done"]);
	});

	it("should reject unacceptable encodings with a 406 response", () => {
		// Arrange
		const response = createResponse();
		const middleware = createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 0, acceptable: false }, false),
		);

		// Act
		middleware(createRequest("br;q=0"), response, vi.fn());
		response.write("payload", (error?: Error | null) => {
			expect(error).toBeInstanceOf(Error);
		});
		response.end("payload");

		// Assert
		expect(response.statusCode).toBe(406);
		expect(response.endedWith).toEqual(["Not Acceptable"]);
		expect(response.headers.get("vary")).toBe("Accept-Encoding");
	});

	it("should compress writes and ends when negotiation selects an available stream", () => {
		// Arrange
		const response = createResponse();
		const compressor = new PassThrough();
		const middleware = createDynamicCompressionMiddleware(
			engineFor(
				{ algorithm: "gzip", qValue: 1, acceptable: true },
				true,
				compressor,
			),
		);

		// Act
		middleware(createRequest("gzip"), response, vi.fn());
		response.write("payload");
		response.end("done");

		// Assert
		expect(response.headers.get("content-encoding")).toBe("gzip");
		expect(response.headers.get("vary")).toBe("Accept-Encoding");
	});

	it("should preserve identity behavior across writeHead, flushHeaders, and end overloads", () => {
		// Arrange
		const response = createResponse();
		const middleware = createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 1, acceptable: true }, true),
		);

		// Act
		middleware(createRequest("identity"), response, vi.fn());
		response.writeHead(201, "Created", { "X-Request": "test" });
		response.flushHeaders();
		response.write("first", "utf8", vi.fn());
		response.write("second", vi.fn());
		response.end(Buffer.from("last"), "utf8", vi.fn());

		// Assert
		expect(response.statusCode).toBe(201);
		expect(response.headers.get("x-request")).toBe("test");
		expect(response.writes).toEqual(["first", "second"]);
		expect(response.endedWith).toEqual([Buffer.from("last")]);
	});

	it("should bypass negotiation for bodyless, sent, and pre-encoded responses", () => {
		// Arrange
		const engine = engineFor(
			{ algorithm: "gzip", qValue: 1, acceptable: true },
			true,
		);
		const bodyless = createResponse();
		const sent = createResponse();
		sent.headersSent = true;
		const encoded = createResponse();
		encoded.headers.set("content-encoding", "br");

		// Act
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

		// Assert
		expect(engine.negotiate).not.toHaveBeenCalled();
		expect(bodyless.endedWith).toEqual(["bodyless"]);
		expect(sent.endedWith).toEqual(["sent"]);
		expect(encoded.endedWith).toEqual(["encoded"]);
	});

	it("should fall back to identity when the response is not compressible or no stream is created", () => {
		// Arrange
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

		// Act
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

		// Assert
		expect(nonCompressibleEngine.createCompressorStream).not.toHaveBeenCalled();
		expect(unavailableEngine.createCompressorStream).toHaveBeenCalledWith(
			"gzip",
		);
		expect(nonCompressible.endedWith).toEqual(["plain"]);
		expect(unavailable.endedWith).toEqual(["fallback"]);
	});

	it("should destroy active streams when the response closes", () => {
		// Arrange
		const response = createResponse();
		const compressor = new PassThrough();
		const middleware = createDynamicCompressionMiddleware(
			engineFor(
				{ algorithm: "gzip", qValue: 1, acceptable: true },
				true,
				compressor,
			),
		);

		// Act
		middleware(createRequest("gzip"), response, vi.fn());
		response.write("payload");
		response.emit("close");

		// Assert
		expect(compressor.destroyed).toBe(true);
		expect(response.destroyed).toBe(false);
	});

	it("should forward compressed write and end overloads to the compressor", () => {
		// Arrange
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

		// Act
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

		// Assert
		expect(first.compressor.destroyed).toBe(false);
		expect(second.compressor.destroyed).toBe(false);
		expect(third.compressor.destroyed).toBe(false);
		expect(fourth.compressor.destroyed).toBe(false);
	});

	it("should preserve writeHead headers and status when compression starts there", () => {
		// Arrange
		const response = createResponse();
		const compressor = new PassThrough();
		const middleware = createDynamicCompressionMiddleware(
			engineFor(
				{ algorithm: "gzip", qValue: 1, acceptable: true },
				true,
				compressor,
			),
		);

		// Act
		middleware(createRequest("gzip"), response, vi.fn());
		response.writeHead(201, {
			"Content-Length": 7,
			"X-Defined": undefined,
			"X-Request": "test",
		});

		// Assert
		expect(response.statusCode).toBe(201);
		expect(response.headers.get("content-encoding")).toBe("gzip");
		expect(response.headers.get("content-length")).toBeUndefined();
		expect(response.headers.get("x-request")).toBe("test");
	});

	it("should invoke the rejection callback and survive an original end failure", () => {
		// Arrange
		const response = createResponse();
		response.end = () => {
			throw new Error("socket closed");
		};
		const callback = vi.fn<(error?: Error | null) => void>();
		const middleware = createDynamicCompressionMiddleware(
			engineFor({ algorithm: "identity", qValue: 0, acceptable: false }, false),
		);

		// Act
		middleware(createRequest("br;q=0"), response, vi.fn());
		const writable = response.write("payload", "utf8", callback);
		const result = response.end();

		// Assert
		expect(writable).toBe(false);
		expect(callback).toHaveBeenCalledWith(expect.any(Error));
		expect(response.destroyed).toBe(true);
		expect(result).toBe(response);
	});

	it("should destroy the response when a compressor emits an error", () => {
		// Arrange
		const response = createResponse();
		const compressor = new PassThrough();
		const middleware = createDynamicCompressionMiddleware(
			engineFor(
				{ algorithm: "gzip", qValue: 1, acceptable: true },
				true,
				compressor,
			),
		);

		// Act
		middleware(createRequest("gzip"), response, vi.fn());
		response.write("payload");
		compressor.emit("error", new Error("compression failed"));

		// Assert
		expect(response.destroyed).toBe(true);
		expect(response.listenerCount("close")).toBe(0);
	});

	it("should propagate response backpressure through the compression sink", async () => {
		// Arrange
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

		// Act
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

		// Assert
		expect(body).toBe("payload");
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});
});
