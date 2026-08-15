import { describe, expect, it } from "vitest";
import { createCOEPMiddleware } from "../../package/core/securities/security/headers/cross-origin-embedder-policy/coep.middleware";

describe("COEP Middleware", () => {
	it("should set require-corp policy", () => {
		const middleware = createCOEPMiddleware(true);
		const headers: Record<string, string> = {};
		const res = {
			setHeader: (k: string, v: string) => {
				headers[k] = v;
			},
		};

		middleware({}, res, () => {});
		expect(headers["Cross-Origin-Embedder-Policy"]).toBe("require-corp");
	});
});
