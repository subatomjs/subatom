import type { ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IRequest } from "../../../../../packages/core/http/request/types/request.types.js";
import type { IResponse } from "../../../../../packages/core/http/response/types/response.types.js";
import { combinePaths } from "../../../../../packages/core/subatom/helpers/combinePath.js";
import { createRateLimitMiddleware } from "../../../../../packages/core/subatom/helpers/createRateLimitMiddleware.js";
import { parseRateLimitSpec } from "../../../../../packages/core/subatom/helpers/parseRateLimitSpec.js";

describe("Helpers: combinePaths", () => {
	it("should return '/' when called with no arguments, null, undefined, or empty strings", () => {
		expect(combinePaths()).toBe("/");
		expect(combinePaths(null, undefined, "")).toBe("/");
		expect(combinePaths("   ", "/")).toBe("/");
	});

	it("should normalize and join single and multiple segments cleanly", () => {
		expect(combinePaths("api")).toBe("/api");
		expect(combinePaths("/api", "v1", "users")).toBe("/api/v1/users");
		expect(combinePaths("api/", "/v1/", "/users/")).toBe("/api/v1/users");
	});

	it("should collapse multiple consecutive slashes and trim whitespace", () => {
		expect(combinePaths(" ///api/// ", " //v1// ", "items//")).toBe(
			"/api/v1/items",
		);
	});
});

describe("Helpers: parseRateLimitSpec", () => {
	it("should parse valid specifications across all supported time units", () => {
		expect(parseRateLimitSpec("10/ms")).toEqual({ limit: 10, windowMs: 1 });
		expect(parseRateLimitSpec("5/millisecond")).toEqual({
			limit: 5,
			windowMs: 1,
		});
		expect(parseRateLimitSpec("1/milliseconds")).toEqual({
			limit: 1,
			windowMs: 1,
		});

		expect(parseRateLimitSpec("60/s")).toEqual({ limit: 60, windowMs: 1000 });
		expect(parseRateLimitSpec("60/sec")).toEqual({ limit: 60, windowMs: 1000 });
		expect(parseRateLimitSpec("60/secs")).toEqual({
			limit: 60,
			windowMs: 1000,
		});
		expect(parseRateLimitSpec("60/second")).toEqual({
			limit: 60,
			windowMs: 1000,
		});
		expect(parseRateLimitSpec("60/seconds")).toEqual({
			limit: 60,
			windowMs: 1000,
		});

		expect(parseRateLimitSpec("100/m")).toEqual({
			limit: 100,
			windowMs: 60000,
		});
		expect(parseRateLimitSpec("100/min")).toEqual({
			limit: 100,
			windowMs: 60000,
		});
		expect(parseRateLimitSpec("100/mins")).toEqual({
			limit: 100,
			windowMs: 60000,
		});
		expect(parseRateLimitSpec("100/minute")).toEqual({
			limit: 100,
			windowMs: 60000,
		});
		expect(parseRateLimitSpec("100/minutes")).toEqual({
			limit: 100,
			windowMs: 60000,
		});

		expect(parseRateLimitSpec("1000/h")).toEqual({
			limit: 1000,
			windowMs: 3600000,
		});
		expect(parseRateLimitSpec("1000/hr")).toEqual({
			limit: 1000,
			windowMs: 3600000,
		});
		expect(parseRateLimitSpec("1000/hrs")).toEqual({
			limit: 1000,
			windowMs: 3600000,
		});
		expect(parseRateLimitSpec("1000/hour")).toEqual({
			limit: 1000,
			windowMs: 3600000,
		});
		expect(parseRateLimitSpec("1000/hours")).toEqual({
			limit: 1000,
			windowMs: 3600000,
		});

		expect(parseRateLimitSpec("5000/d")).toEqual({
			limit: 5000,
			windowMs: 86400000,
		});
		expect(parseRateLimitSpec("5000/day")).toEqual({
			limit: 5000,
			windowMs: 86400000,
		});
		expect(parseRateLimitSpec("5000/days")).toEqual({
			limit: 5000,
			windowMs: 86400000,
		});
	});

	it("should throw TypeError on invalid input shapes", () => {
		expect(() => parseRateLimitSpec("")).toThrow(TypeError);
		expect(() => parseRateLimitSpec("   ")).toThrow(TypeError);
		expect(() => parseRateLimitSpec(null as unknown as string)).toThrow(
			TypeError,
		);
		expect(() => parseRateLimitSpec("invalid")).toThrow(TypeError);
		expect(() => parseRateLimitSpec("abc/min")).toThrow(TypeError);
		expect(() => parseRateLimitSpec("0/min")).toThrow(TypeError);
		expect(() => parseRateLimitSpec("-5/min")).toThrow(TypeError);
		expect(() => parseRateLimitSpec("100/fortnight")).toThrow(TypeError);
	});
});

describe("Helpers: createRateLimitMiddleware", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	function createMockResponse() {
		const headers: Record<string, string> = {};
		const rawResponse = {
			headersSent: false,
			writableEnded: false,
			setHeader: vi.fn(function (
				this: ServerResponse,
				key: string,
				value: string | number | readonly string[],
			): ServerResponse {
				headers[key.toLowerCase()] = String(value);
				return this;
			}),
			writeHead: vi.fn(),
			end: vi.fn(function (
				this: ServerResponse & { writableEnded: boolean },
			): ServerResponse {
				this.writableEnded = true;
				return this;
			}),
		} satisfies Partial<ServerResponse>;

		return {
			res: { rawResponse } as unknown as IResponse,
			rawResponse,
			headers,
		};
	}

	it("should allow requests under the limit and set proper headers", () => {
		const middleware = createRateLimitMiddleware("2/min");
		const req = { ip: "127.0.0.1" } as unknown as IRequest;
		const { res, rawResponse } = createMockResponse();
		const next = vi.fn();

		middleware(req, res, next);
		expect(next).toHaveBeenCalledTimes(1);
		expect(rawResponse.setHeader).toHaveBeenCalledWith(
			"X-RateLimit-Limit",
			"2",
		);
		expect(rawResponse.setHeader).toHaveBeenCalledWith(
			"X-RateLimit-Remaining",
			"1",
		);
		expect(rawResponse.setHeader).toHaveBeenCalledWith(
			"X-RateLimit-Reset",
			expect.any(String),
		);
	});

	it("should block requests that exceed limit with 429 status and JSON payload", () => {
		const middleware = createRateLimitMiddleware("1/sec");
		const req = { ip: "192.168.1.1" } as unknown as IRequest;
		const next = vi.fn();

		const first = createMockResponse();
		middleware(req, first.res, next);
		expect(next).toHaveBeenCalledTimes(1);

		const second = createMockResponse();
		middleware(req, second.res, next);
		expect(next).toHaveBeenCalledTimes(1);
		expect(second.rawResponse.writeHead).toHaveBeenCalledWith(429, {
			"Content-Type": "application/json",
		});
		expect(second.rawResponse.end).toHaveBeenCalledWith(
			expect.stringContaining("Too Many Requests"),
		);
	});

	it("should resolve IP address from socket and headers fallback", () => {
		const middleware = createRateLimitMiddleware("5/min");
		const next = vi.fn();

		const reqSocket = {
			raw: { socket: { remoteAddress: "10.0.0.1" } as unknown as Socket },
		} as unknown as IRequest;
		middleware(reqSocket, createMockResponse().res, next);

		const reqForwarded = {
			raw: { headers: { "x-forwarded-for": "10.0.0.2" } },
		} as unknown as IRequest;
		middleware(reqForwarded, createMockResponse().res, next);

		const reqUnknown = {} as unknown as IRequest;
		middleware(reqUnknown, createMockResponse().res, next);

		expect(next).toHaveBeenCalledTimes(3);
	});

	it("should clean expired buckets periodically without failing", () => {
		const middleware = createRateLimitMiddleware("10/ms");
		const next = vi.fn();

		for (let i = 0; i < 257; i++) {
			const req = { ip: `10.0.0.${i}` } as unknown as IRequest;
			middleware(req, createMockResponse().res, next);
		}
		expect(next).toHaveBeenCalledTimes(257);

		vi.advanceTimersByTime(10);
		middleware(
			{ ip: "10.0.0.1" } as unknown as IRequest,
			createMockResponse().res,
			next,
		);
		expect(next).toHaveBeenCalledTimes(258);
	});

	it("should fail open and call next() if an unexpected exception occurs", () => {
		const middleware = createRateLimitMiddleware("5/min");
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const brokenReq = {
			get ip(): string {
				throw new Error("Socket error");
			},
		} as unknown as IRequest;
		const next = vi.fn();

		middleware(brokenReq, createMockResponse().res, next);
		expect(next).toHaveBeenCalledTimes(1);
		expect(errSpy).toHaveBeenCalledWith(
			expect.stringContaining("Rate limiter middleware failed"),
			expect.any(Error),
		);
	});
});
