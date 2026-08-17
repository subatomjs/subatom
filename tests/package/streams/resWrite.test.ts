import type { ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { resWrite } from "../../../package/core/http/streams/methods/response/resWrite.js";

describe("resWrite", () => {
	function createMockResponse(overrides: Partial<ServerResponse> = {}) {
		return {
			writableEnded: false,
			finished: false,
			write: vi.fn().mockReturnValue(true),
			...overrides,
		} as unknown as ServerResponse;
	}

	it("should write data and return true on active stream", () => {
		const res = createMockResponse();
		const result = resWrite(res, "content", "utf-8");

		expect(result).toBe(true);
		expect(res.write).toHaveBeenCalledWith("content", "utf-8", undefined);
	});

	it("should support passing callback as the second argument", () => {
		const res = createMockResponse();
		const cb = vi.fn();

		const result = resWrite(res, "content", cb as any);

		expect(result).toBe(true);
		expect(res.write).toHaveBeenCalledWith("content", "utf-8", cb);
	});

	it("should return false and invoke callback with error if stream is closed/finished", () => {
		const res = createMockResponse({ writableEnded: true });
		const cb = vi.fn();

		const result = resWrite(res, "content", "utf-8", cb);

		expect(result).toBe(false);
		expect(cb).toHaveBeenCalledWith(
			expect.objectContaining({
				message:
					"[Subatom Stream Error]: Cannot write to closed response stream.",
			}),
		);
		expect(res.write).not.toHaveBeenCalled();
	});

	it("should return false without throwing when no callback is provided on finished stream", () => {
		const res = createMockResponse({ finished: true });
		const result = resWrite(res, "content");

		expect(result).toBe(false);
		expect(res.write).not.toHaveBeenCalled();
	});
});
