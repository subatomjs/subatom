import type { IncomingMessage } from "node:http";
import { describe, it, expect, vi } from "vitest";
import { resolveClientIp } from "../../../../../../packages/core/http/request/services/resolveClientIp.service.js";

describe("resolveClientIp", () => {
	it("should return remoteAddress when trustProxy is false", () => {
		const raw = {
			socket: { remoteAddress: "192.168.1.100" },
		} as unknown as IncomingMessage;
		const headers = { "x-forwarded-for": "203.0.113.195, 70.41.3.18" };

		expect(resolveClientIp(raw, headers, false)).toBe("192.168.1.100");
	});

	it("should extract the first client IP from x-forwarded-for when trustProxy is true", () => {
		const raw = {
			socket: { remoteAddress: "192.168.1.100" },
		} as unknown as IncomingMessage;
		const headers = { "x-forwarded-for": "203.0.113.195, 70.41.3.18" };

		expect(resolveClientIp(raw, headers, true)).toBe("203.0.113.195");
	});

	it("should fall back to empty string when trustProxy is true and x-forwarded-for is empty with no remoteAddress", () => {
		const raw = {
			socket: {},
		} as unknown as IncomingMessage;
		const headers = { "x-forwarded-for": "" };

		expect(resolveClientIp(raw, headers, true)).toBe("");
	});

	it("should fall back to remoteAddress when trustProxy is true but x-forwarded-for is absent", () => {
		const raw = {
			socket: { remoteAddress: "10.0.0.1" },
		} as unknown as IncomingMessage;

		expect(resolveClientIp(raw, {}, true)).toBe("10.0.0.1");
	});

	it("should return an empty string when remoteAddress is undefined", () => {
		const raw = {
			socket: {},
		} as unknown as IncomingMessage;

		expect(resolveClientIp(raw, {}, false)).toBe("");
	});

	it("should cover fallback branch when x-forwarded-for splits to empty or undefined index 0", () => {
		const raw = {
			socket: { remoteAddress: "10.0.0.1" },
		} as unknown as IncomingMessage;

		const splitSpy = vi
			.spyOn(String.prototype, "split")
			.mockReturnValueOnce([] as unknown as string[]);
		const result = resolveClientIp(
			raw,
			{ "x-forwarded-for": "something" },
			true,
		);
		expect(result).toBe("");
		splitSpy.mockRestore();
	});
});
