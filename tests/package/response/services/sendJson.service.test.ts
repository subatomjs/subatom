import type { ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { sendJson } from "../../../../package/core/http/response/services/sendJson.service.js";

describe("sendJson.service", () => {
	function createMockServerResponse() {
		return {
			writableEnded: false,
			end: vi.fn(),
			setHeader: vi.fn(),
		} as unknown as ServerResponse;
	}

	it("should return early if response writableEnded is true", () => {
		const raw = createMockServerResponse();
		(raw as any).writableEnded = true;
		const headersMap = new Map<string, string | string[]>();

		sendJson(raw, headersMap, false, { test: 123 });

		expect(raw.end).not.toHaveBeenCalled();
	});

	it("should throw SubatomError when JSON contains circular reference", () => {
		const raw = createMockServerResponse();
		const headersMap = new Map<string, string | string[]>();
		const circular: Record<string, any> = {};
		circular.self = circular;

		expect(() => sendJson(raw, headersMap, false, circular)).toThrowError(
			/Failed to serialize JSON response:/,
		);
	});

	it("should serialize valid object and set Content-Type to application/json", () => {
		const raw = createMockServerResponse();
		const headersMap = new Map<string, string | string[]>();
		const data = { message: "ok", count: 42 };

		sendJson(raw, headersMap, false, data);

		expect(headersMap.get("content-type")).toBe(
			"application/json; charset=utf-8",
		);
		expect(raw.end).toHaveBeenCalledWith(JSON.stringify(data));
	});

	it("should preserve custom Content-Type if already present", () => {
		const raw = createMockServerResponse();
		const headersMap = new Map<string, string | string[]>([
			["content-type", "application/problem+json"],
		]);

		sendJson(raw, headersMap, false, { problem: true });

		expect(headersMap.get("content-type")).toBe("application/problem+json");
		expect(raw.end).toHaveBeenCalledWith(JSON.stringify({ problem: true }));
	});
});
