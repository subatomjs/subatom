import { describe, it, expect } from "vitest";
import {
	acceptsHeader,
	parseAcceptTypes,
} from "../../../../../../packages/core/http/request/services/acceptsHeader.service.js";

describe("acceptsHeader and parseAcceptTypes", () => {
	describe("parseAcceptTypes", () => {
		it("should parse media types and default q-values", () => {
			const parsed = parseAcceptTypes("text/html, application/json;q=0.8");
			expect(parsed).toEqual([
				{ type: "text", subtype: "html", q: 1.0 },
				{ type: "application", subtype: "json", q: 0.8 },
			]);
		});

		it("should handle fallback wildcards for malformed entries", () => {
			const parsed = parseAcceptTypes("");
			expect(parsed).toEqual([{ type: "", subtype: "*", q: 1.0 }]);
		});
	});

	describe("acceptsHeader", () => {
		it("should return true if Accept header is missing (RFC 7231 default)", () => {
			expect(acceptsHeader({}, "application/json")).toBe(true);
		});

		it("should return false when the target contentType is malformed", () => {
			expect(acceptsHeader({ accept: "*/*" }, "malformed")).toBe(false);
		});

		it("should match full wildcard */*", () => {
			expect(acceptsHeader({ accept: "*/*" }, "text/plain")).toBe(true);
		});

		it("should match subtype wildcards", () => {
			expect(acceptsHeader({ accept: "image/*" }, "image/png")).toBe(true);
			expect(acceptsHeader({ accept: "image/*" }, "application/json")).toBe(
				false,
			);
		});

		it("should match exact types and subtypes", () => {
			expect(
				acceptsHeader({ accept: "application/json" }, "application/json"),
			).toBe(true);
			expect(acceptsHeader({ accept: "application/json" }, "text/html")).toBe(
				false,
			);
		});

		it("should reject a matching media type with a different subtype", () => {
			expect(
				acceptsHeader({ accept: "application/xml" }, "application/json"),
			).toBe(false);
		});

		it("should reject matches when the client specifies q=0", () => {
			const headers = { accept: "text/html;q=0, application/json;q=1" };
			expect(acceptsHeader(headers, "text/html")).toBe(false);
			expect(acceptsHeader(headers, "application/json")).toBe(true);
		});
	});

	it("should default q to 1.0 when q parameter cannot be parsed as a float", () => {
		const parsed = parseAcceptTypes("application/json;q=invalid");
		expect(parsed).toEqual([{ type: "application", subtype: "json", q: 1.0 }]);
	});
	it("should ignore q-value when parseFloat returns NaN", () => {
		const parsed = parseAcceptTypes("text/html;q=.");
		expect(parsed).toEqual([{ type: "text", subtype: "html", q: 1.0 }]);
	});
});
