import { describe, expect, it } from "vitest";
import {
	parseCookieHeader,
	serializeCookie,
} from "../../../package/core/factory-functions/utils/cookie.js";

describe("Cookie Utility (parseCookieHeader & serializeCookie)", () => {
	describe("parseCookieHeader", () => {
		it("should return an empty object if header is undefined or empty", () => {
			expect(parseCookieHeader(undefined)).toEqual({});
			expect(parseCookieHeader("")).toEqual({});
		});

		it("should parse single and multiple key-value pairs with whitespace trimming", () => {
			const header = "sid=12345; user=john_doe; theme=dark";
			expect(parseCookieHeader(header)).toEqual({
				sid: "12345",
				user: "john_doe",
				theme: "dark",
			});
		});

		it("should decode URI encoded values correctly", () => {
			const header = "message=Hello%20World%21; email=test%40example.com";
			expect(parseCookieHeader(header)).toEqual({
				message: "Hello World!",
				email: "test@example.com",
			});
		});

		it("should fallback to raw value if decodeURIComponent throws", () => {
			const header = "malformed=%E0%A4%A";
			const parsed = parseCookieHeader(header);
			expect(parsed.malformed).toBe("%E0%A4%A");
		});

		it("should ignore malformed cookie segments without '=' or empty keys", () => {
			const header =
				"valid=yes; ; malformedWithoutEquals; =emptyKey; another=1";
			expect(parseCookieHeader(header)).toEqual({
				valid: "yes",
				another: "1",
			});
		});
	});

	describe("serializeCookie", () => {
		it("should serialize basic name and value with default Path=/", () => {
			const cookie = serializeCookie("sid", "abc123xyz");
			expect(cookie).toBe("sid=abc123xyz; Path=/");
		});

		it("should properly URI encode cookie values", () => {
			const cookie = serializeCookie(
				"session data",
				"val with spaces & special=chars",
			);
			expect(cookie).toBe(
				"session data=val%20with%20spaces%20%26%20special%3Dchars; Path=/",
			);
		});

		it("should include Max-Age converted from milliseconds to seconds", () => {
			const cookie = serializeCookie("sid", "123", { maxAge: 60000 });
			expect(cookie).toContain("Max-Age=60");
		});

		it("should include Domain and custom Path", () => {
			const cookie = serializeCookie("sid", "123", {
				domain: "subatom.dev",
				path: "/api",
			});
			expect(cookie).toContain("Domain=subatom.dev; Path=/api");
		});

		it("should format Expires to UTC string", () => {
			const date = new Date("2026-08-17T12:00:00.000Z");
			const cookie = serializeCookie("sid", "123", { expires: date });
			expect(cookie).toContain(`Expires=${date.toUTCString()}`);
		});

		it("should append HttpOnly and Secure flags when true", () => {
			const cookie = serializeCookie("sid", "123", {
				httpOnly: true,
				secure: true,
			});
			expect(cookie).toContain("; HttpOnly");
			expect(cookie).toContain("; Secure");
		});

		it("should handle sameSite boolean true as 'Strict'", () => {
			const cookie = serializeCookie("sid", "123", { sameSite: true });
			expect(cookie).toContain("; SameSite=Strict");
		});

		it("should handle sameSite string options ('lax', 'strict', 'none') with capitalization", () => {
			expect(serializeCookie("sid", "123", { sameSite: "lax" })).toContain(
				"; SameSite=Lax",
			);
			expect(serializeCookie("sid", "123", { sameSite: "strict" })).toContain(
				"; SameSite=Strict",
			);
			expect(serializeCookie("sid", "123", { sameSite: "none" })).toContain(
				"; SameSite=None",
			);
		});
	});
});
