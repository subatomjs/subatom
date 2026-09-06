import { EventEmitter } from "node:events";
import type { IncomingMessage } from "node:http";
import { PassThrough, Writable } from "node:stream";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Request } from "../../../../../packages/core/http/request/Request.js";
import { BadRequestError } from "../../../../../packages/errors/Errors.js";

function createMockIncomingMessage(
	options: {
		method?: string;
		url?: string;
		headers?: Record<string, string | string[] | undefined>;
		encrypted?: boolean;
		remoteAddress?: string;
	} = {},
): IncomingMessage {
	const emitter = new EventEmitter();
	const raw = Object.assign(emitter, {
		method: options.method ?? "GET",
		url: options.url ?? "/api/users?page=1&sort=desc",
		headers: options.headers ?? {
			host: "localhost:3000",
			cookie: "token=secret123; role=admin",
		},
		socket: {
			remoteAddress: options.remoteAddress ?? "127.0.0.1",
			encrypted: options.encrypted || false,
		},
		off: emitter.removeListener.bind(emitter),
	});

	return raw as unknown as IncomingMessage;
}

describe("Request", () => {
	const originalEnvProxy = process.env.SUBATOM_TRUST_PROXY;

	beforeEach(() => {
		delete process.env.SUBATOM_TRUST_PROXY;
	});

	afterEach(() => {
		if (originalEnvProxy !== undefined) {
			process.env.SUBATOM_TRUST_PROXY = originalEnvProxy;
		} else {
			delete process.env.SUBATOM_TRUST_PROXY;
		}
	});

	it("should initialize properties and parse url, query, cookies, and path", () => {
		const raw = createMockIncomingMessage();
		const req = new Request(raw);

		expect(req.method).toBe("GET");
		expect(req.url).toBe("/api/users?page=1&sort=desc");
		expect(req.path).toBe("/api/users");
		expect(req.query).toEqual({ page: "1", sort: "desc" });
		expect(req.cookies).toEqual({ token: "secret123", role: "admin" });
		expect(req.protocol).toBe("http");
		expect(req.hostname).toBe("localhost");
		expect(req.secure).toBe(false);
		expect(req.ip).toBe("127.0.0.1");
	});

	describe("trustProxy complete branch matrix", () => {
		it("case 1: options.trustProxy = undefined, SUBATOM_TRUST_PROXY unset -> false", () => {
			delete process.env.SUBATOM_TRUST_PROXY;
			const raw = createMockIncomingMessage({
				headers: { host: "lb", "x-forwarded-for": "10.0.0.2" },
				remoteAddress: "127.0.0.1",
			});
			const req = new Request(raw);
			expect(req.ip).toBe("127.0.0.1");
		});

		it("case 2: options.trustProxy = undefined, SUBATOM_TRUST_PROXY = 'true' -> true", () => {
			process.env.SUBATOM_TRUST_PROXY = "true";
			const raw = createMockIncomingMessage({
				headers: { host: "lb", "x-forwarded-for": "10.0.0.2" },
			});
			const req = new Request(raw);
			expect(req.ip).toBe("10.0.0.2");
		});

		it("case 3: options.trustProxy = undefined, SUBATOM_TRUST_PROXY = 'false' -> false", () => {
			process.env.SUBATOM_TRUST_PROXY = "false";
			const raw = createMockIncomingMessage({
				headers: { host: "lb", "x-forwarded-for": "10.0.0.2" },
				remoteAddress: "127.0.0.1",
			});
			const req = new Request(raw);
			expect(req.ip).toBe("127.0.0.1");
		});

		it("case 4: options.trustProxy = true, SUBATOM_TRUST_PROXY unset -> true", () => {
			delete process.env.SUBATOM_TRUST_PROXY;
			const raw = createMockIncomingMessage({
				headers: { host: "lb", "x-forwarded-for": "10.0.0.3" },
			});
			const req = new Request(raw, { trustProxy: true });
			expect(req.ip).toBe("10.0.0.3");
		});

		it("case 5: options.trustProxy = false, SUBATOM_TRUST_PROXY = 'true' -> false", () => {
			process.env.SUBATOM_TRUST_PROXY = "true";
			const raw = createMockIncomingMessage({
				headers: { host: "lb", "x-forwarded-for": "10.0.0.3" },
				remoteAddress: "127.0.0.1",
			});
			const req = new Request(raw, { trustProxy: false });
			expect(req.ip).toBe("127.0.0.1");
		});
	});

	it("should default method to GET, url to /, and hostname to localhost when headers are omitted", () => {
		const raw = createMockIncomingMessage({
			method: "",
			url: "",
			headers: {},
		});
		const req = new Request(raw);

		expect(req.method).toBe("GET");
		expect(req.url).toBe("/");
		expect(req.hostname).toBe("localhost");
	});

	it("should throw BadRequestError on a malformed URL", () => {
		const raw = createMockIncomingMessage({ url: "http://[invalid-url" });
		expect(() => new Request(raw)).toThrow(BadRequestError);
	});

	it("should clean up error and close listeners on stream close", () => {
		const raw = createMockIncomingMessage();
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		new Request(raw);
		expect(raw.listenerCount("error")).toBe(1);
		expect(raw.listenerCount("close")).toBe(1);

		raw.emit("error", new Error("Simulated socket error"));
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			"[Subatom Stream Error]: Request socket issue:",
			"Simulated socket error",
		);

		raw.emit("close");
		expect(raw.listenerCount("error")).toBe(0);
		expect(raw.listenerCount("close")).toBe(0);
		consoleErrorSpy.mockRestore();
	});

	it("should delegate get() to getHeader", () => {
		const raw = createMockIncomingMessage({
			headers: { "x-api-version": "v2" },
		});
		const req = new Request(raw);

		expect(req.get("X-Api-Version")).toBe("v2");
		expect(req.get("unknown")).toBeUndefined();
	});

	describe("accepts negotiation", () => {
		it("should return a boolean when passed a single type", () => {
			const raw = createMockIncomingMessage({
				headers: { accept: "text/html, application/xhtml+xml" },
			});
			const req = new Request(raw);

			expect(req.accepts("text/html")).toBe(true);
			expect(req.accepts("application/json")).toBe(false);
		});

		it("should return the matched string or false when passed multiple types", () => {
			const raw = createMockIncomingMessage({
				headers: { accept: "application/json, text/plain" },
			});
			const req = new Request(raw);

			expect(req.accepts("text/html", "application/json")).toBe(
				"application/json",
			);
			expect(req.accepts(["image/png", "text/html"])).toBe(false);
		});

		it("should return false when multiple arguments do not match accept header", () => {
			const raw = createMockIncomingMessage({
				headers: { accept: "text/html" },
			});
			const req = new Request(raw);

			expect(req.accepts("application/json", "application/xml")).toBe(false);
		});

		it("should return false when an array of types does not match accept header", () => {
			const raw = createMockIncomingMessage({
				headers: { accept: "text/html" },
			});
			const req = new Request(raw);

			expect(req.accepts(["application/json", "image/webp"])).toBe(false);
		});

		it("should ignore non-string and non-array items passed into accepts args", () => {
			const raw = createMockIncomingMessage({
				headers: { accept: "text/plain" },
			});
			const req = new Request(raw);

			const result = Reflect.apply(req.accepts, req, [
				123,
				null,
				undefined,
				"text/plain",
			]);
			expect(result).toBe("text/plain");
		});
	});

	describe("Body parsers delegation", () => {
		it("should read buffer, text, json, and form data through Request helpers", async () => {
			const createRequestWithBody = (body: string) => {
				const stream = new PassThrough();
				const raw = Object.assign(stream, {
					method: "POST",
					url: "/submit",
					headers: { host: "localhost" },
					socket: { remoteAddress: "127.0.0.1" },
					off: stream.removeListener.bind(stream),
				}) as unknown as IncomingMessage;

				const req = new Request(raw);
				stream.write(Buffer.from(body));
				stream.end();
				return req;
			};

			const jsonReq = createRequestWithBody(JSON.stringify({ user: "Alice" }));
			expect(await jsonReq.json<{ user: string }>()).toEqual({ user: "Alice" });

			const textReq = createRequestWithBody("plain text content");
			expect(await textReq.text()).toBe("plain text content");

			const bufferReq = createRequestWithBody("raw buffer content");
			const buf = await bufferReq.buffer();
			expect(buf).toBeInstanceOf(Buffer);
			expect(buf.toString("utf-8")).toBe("raw buffer content");

			const formReq = createRequestWithBody("field1=val1&field2=val2");
			const form = await formReq.formData();
			expect(form.get("field1")).toBe("val1");
			expect(form.get("field2")).toBe("val2");
		});
	});

	describe("Streaming methods", () => {
		it("should delegate onData, onEnd, pipe, and stream", () => {
			const stream = new PassThrough();
			const raw = Object.assign(stream, {
				method: "POST",
				url: "/upload",
				headers: { host: "localhost" },
				socket: { remoteAddress: "127.0.0.1" },
				off: stream.removeListener.bind(stream),
			}) as unknown as IncomingMessage;

			const req = new Request(raw);
			const dataListener = vi.fn();
			const endListener = vi.fn();

			const unsubscribeData = req.onData(dataListener);
			const unsubscribeEnd = req.onEnd(endListener);

			expect(typeof unsubscribeData).toBe("function");
			expect(typeof unsubscribeEnd).toBe("function");

			const destination = new Writable({
				write(_chunk, _encoding, callback) {
					callback();
				},
			});

			expect(req.pipe(destination)).toBe(destination);
			expect(req.stream()).toBeDefined();

			unsubscribeData();
			unsubscribeEnd();
		});
	});
});
