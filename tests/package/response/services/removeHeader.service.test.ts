import type { ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { removeHeader } from "../../../../package/core/http/response/services/removeHeader.service.js";

describe("removeHeader.service", () => {
	function createMockServerResponse() {
		return {
			removeHeader: vi.fn(),
		} as unknown as ServerResponse;
	}

	it("should remove header from map and raw response when headers are not sent", () => {
		const raw = createMockServerResponse();
		const headersMap = new Map<string, string | string[]>([
			["content-type", "application/json"],
		]);

		removeHeader(raw, headersMap, false, "Content-Type");

		expect(headersMap.has("content-type")).toBe(false);
		expect(raw.removeHeader).toHaveBeenCalledWith("Content-Type");
	});

	it("should warn and not remove header when headersSent is true", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const raw = createMockServerResponse();
		const headersMap = new Map<string, string | string[]>([
			["content-type", "application/json"],
		]);

		removeHeader(raw, headersMap, true, "Content-Type");

		expect(warnSpy).toHaveBeenCalledWith(
			'[Subatom Warning]: Cannot remove header "Content-Type" after headers are sent.',
		);
		expect(headersMap.has("content-type")).toBe(true);
		expect(raw.removeHeader).not.toHaveBeenCalled();
		warnSpy.mockRestore();
	});
});
