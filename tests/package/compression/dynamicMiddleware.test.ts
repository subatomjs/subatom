import { Buffer } from "node:buffer";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import zlib from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { SubatomCompression } from "../../../package/core/http/compression/compressor.js";
import { createDynamicCompressionMiddleware } from "../../../package/core/http/compression/dynamicMiddleware.js";

describe("dynamicMiddleware.ts - createDynamicCompressionMiddleware", () => {
	const setup = (
		options = {},
		reqHeaders: Record<string, string> = { "accept-encoding": "gzip, br" },
	) => {
		const engine = new SubatomCompression(options);
		const middleware = createDynamicCompressionMiddleware(engine);
		const socket = new Socket();
		const req = new IncomingMessage(socket);
		req.headers = { ...reqHeaders };
		const res = new ServerResponse(req);

		// Safely stub stream dispatchers to prevent unhandled ERR_SOCKET_CLOSED
		(res as any)._writeRaw = (_data: any, _encoding: any, cb: any) => {
			if (typeof cb === "function") cb();
			return true;
		};

		return { engine, middleware, req, res, socket };
	};

	it("calls next() immediately when invoking middleware", () => {
		const { middleware, req, res } = setup();
		const next = vi.fn();
		middleware(req, res, next);
		expect(next).toHaveBeenCalledOnce();
	});

	it("compresses full response body with gzip when matching criteria", async () => {
		const engine = new SubatomCompression({ threshold: 10 });
		const socket = new Socket();
		const req = new IncomingMessage(socket);
		req.headers = { "accept-encoding": "gzip" };
		const res = new ServerResponse(req);

		const chunks: Buffer[] = [];

		// Intercept base write before middleware captures originalWrite
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

		const body =
			"This is a large string intended to trigger subatom gzip dynamic compression.";

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

			const middleware = createDynamicCompressionMiddleware(engine);
			middleware(req, res, () => {});

			res.setHeader("Content-Type", "text/plain");
			res.write(body, "utf8", () => {
				res.end();
			});
		});

		expect(res.getHeader("Content-Encoding")).toBe("gzip");
		expect(res.getHeader("Vary")).toBe("Accept-Encoding");
		expect(res.getHeader("Content-Length")).toBeUndefined();

		const decompressed = zlib
			.gunzipSync(Buffer.concat(chunks))
			.toString("utf8");
		expect(decompressed).toBe(body);
	});

	it("returns 406 Not Acceptable when Accept-Encoding negotiation is rejected (*;q=0, identity;q=0)", () => {
		const engine = new SubatomCompression();
		const socket = new Socket();
		const req = new IncomingMessage(socket);
		req.headers = { "accept-encoding": "identity;q=0, *;q=0" };
		const res = new ServerResponse(req);

		let endedWith = "";
		res.end = ((chunk?: any) => {
			if (chunk) endedWith = String(chunk);
			return res;
		}) as unknown as ServerResponse["end"];

		const middleware = createDynamicCompressionMiddleware(engine);
		middleware(req, res, () => {});

		res.setHeader("Content-Type", "text/plain");
		res.end("Test body");

		expect(res.statusCode).toBe(406);
		expect(res.getHeader("Content-Type")).toBe("text/plain; charset=utf-8");
		expect(res.getHeader("Content-Length")).toBeUndefined();
		expect(endedWith).toBe("Not Acceptable");
	});

	it("writes error callback when res.write() is attempted on rejected negotiation", () => {
		const engine = new SubatomCompression();
		const socket = new Socket();
		const req = new IncomingMessage(socket);
		req.headers = { "accept-encoding": "identity;q=0, *;q=0" };
		const res = new ServerResponse(req);

		const middleware = createDynamicCompressionMiddleware(engine);
		middleware(req, res, () => {});

		const writeCallback = vi.fn();
		const writeResult = res.write("sample chunk", writeCallback);

		expect(writeResult).toBe(false);
		expect(writeCallback).toHaveBeenCalledWith(expect.any(Error));
	});

	it("bypasses compression if headersSent is already true", () => {
		const { middleware, req, res } = setup();
		res.end = (() => res) as unknown as ServerResponse["end"];
		middleware(req, res, () => {});

		Object.defineProperty(res, "headersSent", { value: true, writable: true });
		res.setHeader("Content-Type", "text/plain");

		res.end("Uncompressed chunk");
		expect(res.getHeader("Content-Encoding")).toBeUndefined();
	});

	it("preserves status code, reason phrase, and headers passed to writeHead", () => {
		const engine = new SubatomCompression({ threshold: 5 });
		const socket = new Socket();
		const req = new IncomingMessage(socket);
		req.headers = { "accept-encoding": "gzip" };
		const res = new ServerResponse(req);

		res.writeHead = ((statusCode: number) => {
			res.statusCode = statusCode;
			return res;
		}) as unknown as ServerResponse["writeHead"];

		const middleware = createDynamicCompressionMiddleware(engine);
		middleware(req, res, () => {});

		res.writeHead(201, "Created Custom", {
			"Content-Type": "application/json",
			"X-Custom-Header": "custom-value",
		});

		expect(res.statusCode).toBe(201);
		expect(res.getHeader("x-custom-header")).toBe("custom-value");
		expect(res.getHeader("Content-Encoding")).toBe("gzip");
	});

	it("supports flushHeaders() properly during compression flow", () => {
		const { middleware, req, res } = setup();
		res.flushHeaders = vi.fn();
		middleware(req, res, () => {});

		res.setHeader("Content-Type", "text/html");
		expect(() => res.flushHeaders()).not.toThrow();
	});

	it("cleans up streams on client socket close", () => {
		const { middleware, req, res } = setup(
			{ threshold: 0 },
			{ "accept-encoding": "gzip" },
		);
		middleware(req, res, () => {});

		res.setHeader("Content-Type", "text/html");
		res.write("Initial chunk");

		expect(() => res.emit("close")).not.toThrow();
	});

	it("handles backpressure and drain event on underlying socket/response", () => {
		const { middleware, req, res } = setup(
			{ threshold: 0 },
			{ "accept-encoding": "gzip" },
		);
		res.end = (() => res) as unknown as ServerResponse["end"];
		middleware(req, res, () => {});

		res.setHeader("Content-Type", "text/html");

		res.write("Chunk 1");
		res.emit("drain");
		res.end("Chunk 2");
	});

	it("handles write and end when res is already destroyed or ended", () => {
		const { middleware, req, res } = setup();
		middleware(req, res, () => {});

		res.setHeader("Content-Type", "text/html");
		res.destroy();

		const writeCb = vi.fn();
		res.write("test", writeCb);
		res.end();

		expect(res.destroyed).toBe(true);
	});
});
