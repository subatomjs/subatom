import { describe, expect, it, vi } from "vitest";
import {
	isOriginAllowed,
	normalizeHeaderValue,
	resolveOrigin,
} from "../../../../packages/pipelines/securities/cors/cors.utils.js";
import type { CorsOrigin } from "../../../../packages/pipelines/securities/cors/types/cors.types.js";

describe("cors.utils", () => {
	describe("normalizeHeaderValue", () => {
		it("should join arrays with commas and trim elements", () => {
			expect(normalizeHeaderValue([" GET ", "POST", " DELETE "])).toBe(
				"GET,POST,DELETE",
			);
		});

		it("should filter out empty or falsy items in an array", () => {
			expect(normalizeHeaderValue(["GET", "", "   ", "POST"])).toBe("GET,POST");
		});

		it("should trim single string values", () => {
			expect(normalizeHeaderValue("  Content-Type  ")).toBe("Content-Type");
		});

		it("should return empty string if value is undefined or empty", () => {
			expect(normalizeHeaderValue(undefined)).toBe("");
			expect(normalizeHeaderValue("")).toBe("");
		});
	});

	describe("isOriginAllowed", () => {
		it("should match identical string origin", () => {
			expect(
				isOriginAllowed("https://subatomjs.dev", "https://subatomjs.dev"),
			).toBe(true);
			expect(
				isOriginAllowed("https://subatomjs.dev", "https://other.com"),
			).toBe(false);
		});

		it("should evaluate RegExp origin rules", () => {
			const regex = /\.subatomjs\.dev$/;
			expect(isOriginAllowed("https://api.subatomjs.dev", regex)).toBe(true);
			expect(isOriginAllowed("https://api.subatomjs.org", regex)).toBe(false);
		});

		it("should return false for unsupported pattern types", () => {
			expect(
				isOriginAllowed("https://subatomjs.dev", 12345 as unknown as string),
			).toBe(false);
		});
	});

	describe("resolveOrigin", () => {
		it("should resolve wildcard '*' when originConfig is '*' and request has origin", async () => {
			const res = await resolveOrigin("https://example.com", "*");
			expect(res).toBe("*");
		});

		it("should resolve '*' if originConfig is '*' even without requestOrigin", async () => {
			const res = await resolveOrigin(undefined, "*");
			expect(res).toBe("*");
		});

		it("should return false if requestOrigin is missing and originConfig is not '*'", async () => {
			expect(await resolveOrigin(undefined, "https://example.com")).toBe(false);
			expect(await resolveOrigin(undefined, undefined)).toBe(false);
		});

		it("should return false if originConfig is undefined", async () => {
			expect(await resolveOrigin("https://example.com", undefined)).toBe(false);
		});

		it("should return boolean verbatim when originConfig is boolean", async () => {
			expect(await resolveOrigin("https://example.com", true)).toBe(true);
			expect(await resolveOrigin("https://example.com", false)).toBe(false);
		});

		it("should resolve string origin when matched or return false", async () => {
			expect(
				await resolveOrigin("https://example.com", "https://example.com"),
			).toBe("https://example.com");
			expect(
				await resolveOrigin("https://malicious.com", "https://example.com"),
			).toBe(false);
		});

		it("should resolve RegExp origin when matched or return false", async () => {
			const regex = /example\.com$/;
			expect(await resolveOrigin("https://sub.example.com", regex)).toBe(
				"https://sub.example.com",
			);
			expect(await resolveOrigin("https://example.org", regex)).toBe(false);
		});

		it("should resolve array origin if any rule matches", async () => {
			const origins = ["https://a.com", /b\.com$/];
			expect(await resolveOrigin("https://a.com", origins)).toBe(
				"https://a.com",
			);
			expect(await resolveOrigin("https://test.b.com", origins)).toBe(
				"https://test.b.com",
			);
			expect(await resolveOrigin("https://c.com", origins)).toBe(false);
		});

		describe("functional originConfig", () => {
			it("should resolve 1-parameter async/promise function returning boolean", async () => {
				const fn = vi.fn(async (origin?: string) =>
					origin?.includes("allowed"),
				);
				const res = await resolveOrigin("https://allowed.com", fn);

				expect(fn).toHaveBeenCalledWith("https://allowed.com");
				expect(res).toBe("https://allowed.com");

				const denied = await resolveOrigin("https://blocked.com", fn);
				expect(denied).toBe(false);
			});

			it("should resolve 1-parameter synchronous function returning boolean", async () => {
				const fn = (origin?: string) => origin === "https://subatom.dev";
				expect(await resolveOrigin("https://subatom.dev", fn)).toBe(
					"https://subatom.dev",
				);
				expect(await resolveOrigin("https://other.dev", fn)).toBe(false);
			});

			it("should resolve 2-parameter callback function when allowed", async () => {
				const fn = (
					origin: string | undefined,
					cb: (err: Error | null, allow?: boolean) => void,
				) => {
					cb(null, origin === "https://valid.com");
				};

				const res = await resolveOrigin(
					"https://valid.com",
					fn as unknown as CorsOrigin,
				);
				expect(res).toBe("https://valid.com");
			});

			it("should return false when 2-parameter callback produces an error", async () => {
				const fn = (
					_origin: string | undefined,
					cb: (err: Error | null, allow?: boolean) => void,
				) => {
					cb(new Error("Unauthorized origin"));
				};

				const res = await resolveOrigin(
					"https://error.com",
					fn as unknown as CorsOrigin,
				);
				expect(res).toBe(false);
			});

			it("should return false when 2-parameter callback denies allow flag", async () => {
				const fn = (
					_origin: string | undefined,
					cb: (err: Error | null, allow?: boolean) => void,
				) => {
					cb(null, false);
				};

				const res = await resolveOrigin(
					"https://denied.com",
					fn as unknown as CorsOrigin,
				);
				expect(res).toBe(false);
			});
		});

		it("should return false for unsupported config types", async () => {
			expect(
				await resolveOrigin(
					"https://example.com",
					12345 as unknown as CorsOrigin,
				),
			).toBe(false);
		});
	});
});
