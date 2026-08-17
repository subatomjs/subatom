import type { ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { sendBody } from "../../../../package/core/http/response/services/sendBody.service.js";

describe("sendBody.service", () => {
	function createMockServerResponse() {
		return {
			writableEnded: false,
			end: vi.fn(),
			setHeader: vi.fn(),
		} as unknown as ServerResponse;
	}

	it("should return early if response is already writableEnded", () => {
		const raw = createMockServerResponse();
		(raw as any).writableEnded = true;
		const headersMap = new Map<string, string | string[]>();

		sendBody(raw, headersMap, false, "content");

		expect(raw.end).not.toHaveBeenCalled();
	});

	it("should end stream without payload when body is undefined or null", () => {
		const raw = createMockServerResponse();
		const headersMap = new Map<string, string | string[]>();

		sendBody(raw, headersMap, false, undefined);
		expect(raw.end).toHaveBeenCalledTimes(1);

		sendBody(raw, headersMap, false, null as any);
		expect(raw.end).toHaveBeenCalledTimes(2);
	});

	it("should delegate plain object bodies to onJsonDelegate", () => {
		const raw = createMockServerResponse();
		const headersMap = new Map<string, string | string[]>();
		const onJson = vi.fn();

		sendBody(raw, headersMap, false, { key: "value" }, onJson);

		expect(onJson).toHaveBeenCalledWith({ key: "value" });
		expect(raw.end).not.toHaveBeenCalled();
	});

	it("should send string body and set default Content-Type and Content-Length", () => {
		const raw = createMockServerResponse();
		const headersMap = new Map<string, string | string[]>();
		const str = "<h1>Hello Subatom</h1>";

		sendBody(raw, headersMap, false, str);

		expect(headersMap.get("content-type")).toBe("text/html; charset=utf-8");
		expect(headersMap.get("content-length")).toBe(
			Buffer.byteLength(str).toString(),
		);
		expect(raw.end).toHaveBeenCalledWith(str);
	});

	it("should preserve existing Content-Type when sending string", () => {
		const raw = createMockServerResponse();
		const headersMap = new Map<string, string | string[]>([
			["content-type", "text/plain"],
		]);

		sendBody(raw, headersMap, false, "plain text");

		expect(headersMap.get("content-type")).toBe("text/plain");
		expect(headersMap.get("content-length")).toBe("10");
		expect(raw.end).toHaveBeenCalledWith("plain text");
	});

	it("should send Buffer body and calculate byte length correctly", () => {
		const raw = createMockServerResponse();
		const headersMap = new Map<string, string | string[]>();
		const buf = Buffer.from("subatom binary buffer");

		sendBody(raw, headersMap, false, buf);

		expect(headersMap.get("content-length")).toBe(buf.length.toString());
		expect(raw.end).toHaveBeenCalledWith(buf);
	});

	it("should send Uint8Array body and calculate byteLength correctly", () => {
		const raw = createMockServerResponse();
		const headersMap = new Map<string, string | string[]>();
		const arr = new Uint8Array([1, 2, 3, 4, 5]);

		sendBody(raw, headersMap, false, arr);

		expect(headersMap.get("content-length")).toBe(arr.byteLength.toString());
		expect(raw.end).toHaveBeenCalledWith(arr);
	});
});
