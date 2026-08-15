import { describe, expect, it } from "vitest";
import { createHSTSMiddleware } from "../../package/core/securities/security/headers/strict-transport-security/hsts.middleware";

describe("HSTS Middleware", () => {
	it("should apply default HSTS header correctly", () => {
		const middleware = createHSTSMiddleware(true);
		const headers: Record<string, string> = {};
		const res = {
			setHeader: (k: string, v: string) => {
				headers[k] = v;
			},
		};

		middleware({}, res, () => {});
		expect(headers["Strict-Transport-Security"]).toBe(
			"max-age=15552000; includeSubDomains",
		);
	});
});
