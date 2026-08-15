import { describe, expect, it } from "vitest";
import { createXPoweredByMiddleware } from "../../package/core/securities/security/headers/x-powered-by";

describe("X-Powered-By Middleware", () => {
	it("should remove header when configured false", () => {
		const middleware = createXPoweredByMiddleware(false);
		let removed = false;
		const res = {
			removeHeader: (k: string) => {
				if (k === "X-Powered-By") removed = true;
			},
		};

		middleware({}, res, () => {});
		expect(removed).toBe(true);
	});
});
