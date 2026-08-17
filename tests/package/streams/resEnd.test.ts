import type { ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { resEnd } from "../../../package/core/http/streams/methods/response/resEnd.js";

describe("resEnd", () => {
	function createMockResponse(overrides: Partial<ServerResponse> = {}) {
		return {
			writableEnded: false,
			finished: false,
			end: vi.fn(),
			...overrides,
		} as unknown as ServerResponse;
	}

	it("should do nothing if writableEnded is true", () => {
		const res = createMockResponse({ writableEnded: true });
		resEnd(res, "data");
		expect(res.end).not.toHaveBeenCalled();
	});

	it("should do nothing if finished is true", () => {
		const res = createMockResponse({ finished: true });
		resEnd(res, "data");
		expect(res.end).not.toHaveBeenCalled();
	});

	it("should pass chunk, encoding, and callback when all are provided", () => {
		const res = createMockResponse();
		const cb = vi.fn();
		const chunk = Buffer.from("hello");

		resEnd(res, chunk, "utf-8", cb);

		expect(res.end).toHaveBeenCalledWith(chunk, "utf-8", cb);
	});

	it("should handle chunk as a callback function (first argument overload)", () => {
		const res = createMockResponse();
		const cb = vi.fn();

		resEnd(res, cb as any);

		expect(res.end).toHaveBeenCalledWith(undefined, "utf-8", cb);
	});

	it("should handle encoding as a callback function (second argument overload)", () => {
		const res = createMockResponse();
		const cb = vi.fn();

		resEnd(res, "payload", cb as any);

		expect(res.end).toHaveBeenCalledWith("payload", "utf-8", cb);
	});

	it("should default to utf-8 encoding if not specified", () => {
		const res = createMockResponse();
		resEnd(res, "data");

		expect(res.end).toHaveBeenCalledWith("data", "utf-8", undefined);
	});
});
