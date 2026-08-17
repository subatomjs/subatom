// tests/services/getHeader.service.test.ts
import { describe, expect, it } from "vitest";
import { getHeader } from "../../../../package/core/http/request/services/getHeader.service.js";

describe("getHeader service", () => {
	it("should retrieve single string header case-insensitively", () => {
		const headers = {
			"content-type": "application/json",
			authorization: "Bearer xyz",
		};
		expect(getHeader(headers, "Content-Type")).toBe("application/json");
		expect(getHeader(headers, "AUTHORIZATION")).toBe("Bearer xyz");
	});

	it("should join array header values with comma space", () => {
		const headers = { "set-cookie": ["a=1", "b=2"] };
		expect(getHeader(headers, "set-cookie")).toBe("a=1, b=2");
	});

	it("should return undefined if header name is empty or not found", () => {
		const headers = { host: "example.com" };
		expect(getHeader(headers, "")).toBeUndefined();
		expect(getHeader(headers, "x-non-existent")).toBeUndefined();
	});
});
