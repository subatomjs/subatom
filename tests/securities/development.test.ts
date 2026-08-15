import { describe, expect, it } from "vitest";
import { developmentProfile } from "../../package/core/securities/security/profiles/development.profile.js";
import { subatomSecurity } from "../../package/core/securities/security/security.middleware";

describe("Development Profile Test", () => {
	it("should allow unsafe-eval and unsafe-inline in dev profile", () => {
		const middleware = subatomSecurity(developmentProfile);
		const headers: Record<string, string> = {};
		const res = {
			setHeader: (k: string, v: string) => {
				headers[k] = v;
			},
		};

		middleware({}, res, () => {});
		expect(headers["Content-Security-Policy"]).toContain("'unsafe-eval'");
	});
});
