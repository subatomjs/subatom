// tests/services/resolveClientIp.service.test.ts
import { describe, expect, it } from "vitest";
import { resolveClientIp } from "../../../../package/core/http/request/services/resolveClientIp.service.js";
import { createMockIncomingMessage } from "../helpers/mockIncomingMessage.js";

describe("resolveClientIp service", () => {
	it("should return direct socket remoteAddress when trustProxy is false", () => {
		const raw = createMockIncomingMessage({ remoteAddress: "192.168.1.100" });
		const headers = { "x-forwarded-for": "203.0.113.195, 70.41.3.18" };

		const ip = resolveClientIp(raw, headers, false);
		expect(ip).toBe("192.168.1.100");
	});

	it("should extract the first IP from X-Forwarded-For when trustProxy is true", () => {
		const raw = createMockIncomingMessage({ remoteAddress: "10.0.0.1" });
		const headers = { "x-forwarded-for": "203.0.113.195, 70.41.3.18" };

		const ip = resolveClientIp(raw, headers, true);
		expect(ip).toBe("203.0.113.195");
	});

	it("should fallback to socket address if trustProxy is true but header is absent", () => {
		const raw = createMockIncomingMessage({ remoteAddress: "10.0.0.1" });
		const ip = resolveClientIp(raw, {}, true);
		expect(ip).toBe("10.0.0.1");
	});

	it("should return empty string if socket address is missing and no header is trusted", () => {
		const raw = createMockIncomingMessage();
		(raw.socket as any).remoteAddress = undefined;
		const ip = resolveClientIp(raw, {}, false);
		expect(ip).toBe("");
	});
});
