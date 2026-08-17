import type { ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import * as acceptsModule from "../../../../package/core/http/request/services/acceptsHeader.service.js";
import { formatResponse } from "../../../../package/core/http/response/services/format.service.js";

describe("format.service", () => {
	function createMockServerResponse() {
		return {
			statusCode: 200,
			setHeader: vi.fn(),
			end: vi.fn(),
		} as unknown as ServerResponse;
	}

	it("should warn and return early when headersSent is true", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const raw = createMockServerResponse();
		const setType = vi.fn();

		formatResponse(raw, {}, true, { json: vi.fn() }, setType);

		expect(warnSpy).toHaveBeenCalledWith(
			"[Subatom Warning]: Cannot format response; headers already sent.",
		);
		expect(setType).not.toHaveBeenCalled();
		warnSpy.mockRestore();
	});

	it("should execute matching format handler and set content-type", () => {
		vi.spyOn(acceptsModule, "acceptsHeader").mockImplementation(
			(_headers, format) => format === "json",
		);

		const raw = createMockServerResponse();
		const setType = vi.fn();
		const jsonHandler = vi.fn();
		const htmlHandler = vi.fn();

		formatResponse(
			raw,
			{ accept: "application/json" },
			false,
			{
				html: htmlHandler,
				json: jsonHandler,
			},
			setType,
		);

		expect(setType).toHaveBeenCalledWith("json");
		expect(jsonHandler).toHaveBeenCalledTimes(1);
		expect(htmlHandler).not.toHaveBeenCalled();
	});

	it("should fallback to default handler if no formats matched", () => {
		vi.spyOn(acceptsModule, "acceptsHeader").mockReturnValue(false);

		const raw = createMockServerResponse();
		const setType = vi.fn();
		const defaultHandler = vi.fn();

		formatResponse(
			raw,
			{ accept: "image/png" },
			false,
			{
				json: vi.fn(),
				default: defaultHandler,
			},
			setType,
		);

		expect(defaultHandler).toHaveBeenCalledTimes(1);
		expect(setType).not.toHaveBeenCalled();
	});

	it("should respond with 406 Not Acceptable when no match and no default handler", () => {
		vi.spyOn(acceptsModule, "acceptsHeader").mockReturnValue(false);

		const raw = createMockServerResponse();
		const setType = vi.fn();

		formatResponse(
			raw,
			{ accept: "image/png" },
			false,
			{
				html: vi.fn(),
				json: vi.fn(),
			},
			setType,
		);

		expect(raw.statusCode).toBe(406);
		expect(raw.setHeader).toHaveBeenCalledWith(
			"Content-Type",
			"application/json",
		);
		expect(raw.end).toHaveBeenCalledWith(
			JSON.stringify({
				error: "Not Acceptable",
				message: "Server can only supply formats: html, json",
			}),
		);
	});
});
