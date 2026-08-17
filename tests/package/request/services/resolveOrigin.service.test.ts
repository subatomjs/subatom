// tests/services/resolveOrigin.service.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveOrigin } from "../../../../package/core/http/request/services/resolveOrigin.service.js";
import { createMockIncomingMessage } from "../helpers/mockIncomingMessage.js";

describe("resolveOrigin service", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
		delete process.env.SUBATOM_DEFAULT_HOST;
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("should default to http and host header when unencrypted without proxy trust", () => {
		const raw = createMockIncomingMessage({ encrypted: false });
		const headers = {
			host: "api.domain.com:8080",
			"x-forwarded-proto": "https",
			"x-forwarded-host": "spoofed.com",
		};

		const result = resolveOrigin(raw, headers, {}, false);
		expect(result).toEqual({ protocol: "http", host: "api.domain.com:8080" });
	});

	it("should detect TLS encrypted socket as https", () => {
		const raw = createMockIncomingMessage({ encrypted: true });
		const headers = { host: "secure.internal" };

		const result = resolveOrigin(raw, headers, {}, false);
		expect(result.protocol).toBe("https");
		expect(result.host).toBe("secure.internal");
	});

	it("should respect X-Forwarded headers when trustProxy is true", () => {
		const raw = createMockIncomingMessage({ encrypted: false });
		const headers = {
			host: "internal-lb",
			"x-forwarded-proto": "https, http",
			"x-forwarded-host": "api.production.com, proxy-fallback",
		};

		const result = resolveOrigin(raw, headers, {}, true);
		expect(result).toEqual({
			protocol: "https",
			host: "api.production.com",
		});
	});

	it("should fall back to options.defaultHost or env fallback when Host header is missing", () => {
		const raw = createMockIncomingMessage();
		expect(
			resolveOrigin(raw, {}, { defaultHost: "opt-host" }, false).host,
		).toBe("opt-host");

		process.env.SUBATOM_DEFAULT_HOST = "env-host";
		expect(resolveOrigin(raw, {}, {}, false).host).toBe("env-host");

		delete process.env.SUBATOM_DEFAULT_HOST;
		expect(resolveOrigin(raw, {}, {}, false).host).toBe("localhost");
	});
});
