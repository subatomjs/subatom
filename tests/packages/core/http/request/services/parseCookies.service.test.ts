import { describe, it, expect } from "vitest";
import { parseCookies } from "../../../../../../packages/core/http/request/services/parseCookies.service.js";

describe("parseCookies", () => {
	it("should return an empty object if cookieHeader is missing or not a string", () => {
		expect(parseCookies(undefined)).toEqual({});
		expect(parseCookies(null as unknown as string)).toEqual({});
		expect(parseCookies(["cookie=val"] as unknown as string)).toEqual({});
	});

	it("should parse multiple key-value pairs separated by semicolons", () => {
		const header = "session=xyz123; user=alice; theme=dark";
		expect(parseCookies(header)).toEqual({
			session: "xyz123",
			user: "alice",
			theme: "dark",
		});
	});

	it("should decode URI encoded cookie values", () => {
		const header = "user=John%20Doe; city=New%20York";
		expect(parseCookies(header)).toEqual({
			user: "John Doe",
			city: "New York",
		});
	});

	it("should fall back to the raw value when URI decoding fails", () => {
		const header = "invalid=%E0%A4%A";
		expect(parseCookies(header)).toEqual({
			invalid: "%E0%A4%A",
		});
	});

	it("should ignore malformed pairs without equals signs", () => {
		const header = "valid=1; malformed; another=2";
		expect(parseCookies(header)).toEqual({
			valid: "1",
			another: "2",
		});
	});
});
