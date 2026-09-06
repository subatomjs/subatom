import { describe, it, expect } from "vitest";
import { getHeader } from "../../../../../../packages/core/http/request/services/getHeader.service.js";

describe("getHeader", () => {
	it("should return undefined when name is falsy or missing", () => {
		expect(getHeader({}, "")).toBeUndefined();
	});

	it("should retrieve header value case-insensitively", () => {
		const headers = { "content-type": "application/json" };
		expect(getHeader(headers, "Content-Type")).toBe("application/json");
		expect(getHeader(headers, "CONTENT-TYPE")).toBe("application/json");
	});

	it("should join array headers into a comma-separated string", () => {
		const headers = { accept: ["text/html", "application/xhtml+xml"] };
		expect(getHeader(headers, "accept")).toBe(
			"text/html, application/xhtml+xml",
		);
	});

	it("should return undefined when the header key does not exist", () => {
		expect(getHeader({}, "authorization")).toBeUndefined();
	});
});
