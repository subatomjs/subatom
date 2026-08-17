import { describe, expect, it } from "vitest";
import { parseLimit } from "../../../package/core/utils/parseLimit.js";

describe("parseLimit", () => {
	describe("Numeric input", () => {
		it("returns raw number when passed directly", () => {
			expect(parseLimit(500)).toBe(500);
			expect(parseLimit(0)).toBe(0);
			expect(parseLimit(1048576)).toBe(1048576);
		});
	});

	describe("String with standard units", () => {
		it("parses bytes (b / explicit unit or omitted unit)", () => {
			expect(parseLimit("512b")).toBe(512);
			expect(parseLimit("512B")).toBe(512);
			expect(parseLimit("512")).toBe(512);
		});

		it("parses kilobytes (kb)", () => {
			expect(parseLimit("1kb")).toBe(1024);
			expect(parseLimit("2KB")).toBe(2048);
			expect(parseLimit("0.5kb")).toBe(512);
			expect(parseLimit("4 kb")).toBe(4096);
		});

		it("parses megabytes (mb)", () => {
			expect(parseLimit("1mb")).toBe(1024 * 1024);
			expect(parseLimit("50MB")).toBe(50 * 1024 * 1024);
			expect(parseLimit("1.5 mb")).toBe(1.5 * 1024 * 1024);
		});

		it("parses gigabytes (gb)", () => {
			expect(parseLimit("1gb")).toBe(1024 * 1024 * 1024);
			expect(parseLimit("2.5 GB")).toBe(2.5 * 1024 * 1024 * 1024);
		});
	});

	describe("Edge cases & fallback handling", () => {
		it("defaults to 1MB (1048576) on invalid formatted strings", () => {
			expect(parseLimit("invalid")).toBe(1024 * 1024);
			expect(parseLimit("")).toBe(1024 * 1024);
			expect(parseLimit("mb50")).toBe(1024 * 1024);
			expect(parseLimit("-10kb")).toBe(1024 * 1024);
			expect(parseLimit("!@#$%")).toBe(1024 * 1024);
		});

		it("falls back to multiplier 1 when unknown unit string matches regex", () => {
			// Matches regex (\d+)\s*([a-z]+), unit is "tb" which is not in units dictionary
			expect(parseLimit("10tb")).toBe(10);
		});
	});
});
