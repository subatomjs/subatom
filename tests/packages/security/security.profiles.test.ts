import { describe, test, expect } from "vitest";
import { defaultProfile } from "../../../packages/security/profiles/default.profile.js";
import { developmentProfile } from "../../../packages/security/profiles/development.profile.js";
import { enterpriseProfile } from "../../../packages/security/profiles/enterprise.profile.js";
import { productionProfile } from "../../../packages/security/profiles/production.profile.js";

describe("Security Profiles", () => {
	test("defaultProfile matches expected default baseline", () => {
		expect(defaultProfile.csp).toBe(true);
		expect(defaultProfile.hsts).toBe(true);
		expect(defaultProfile.contentTypeOptions).toBe(true);
		expect(defaultProfile.frameguard).toEqual({ action: "SAMEORIGIN" });
		expect(defaultProfile.referrerPolicy).toEqual({ policy: "no-referrer" });
		expect(defaultProfile.coop).toEqual({ policy: "same-origin" });
		expect(defaultProfile.corp).toEqual({ policy: "same-origin" });
		expect(defaultProfile.coep).toBe(false);
		expect(defaultProfile.permissionsPolicy).toBe(true);
		expect(defaultProfile.dnsPrefetchControl).toEqual({ allow: false });
		expect(defaultProfile.downloadOptions).toBe(true);
		expect(defaultProfile.originAgentCluster).toBe(true);
		expect(defaultProfile.xPoweredBy).toBe(false);
	});

	test("developmentProfile provides relaxed developer settings", () => {
		expect(developmentProfile.hsts).toBe(false);
		expect(developmentProfile.frameguard).toBe(false);
		expect(developmentProfile.dnsPrefetchControl).toEqual({ allow: true });
		expect(developmentProfile.originAgentCluster).toBe(false);
		expect(developmentProfile.xPoweredBy).toBe("Subatom Dev Engine");
		expect(developmentProfile.csp).toBeTypeOf("object");
	});

	test("enterpriseProfile configures strict directives and max HSTS", () => {
		expect(enterpriseProfile.hsts).toEqual({
			maxAge: 63072000,
			includeSubDomains: true,
			preload: true,
		});
		expect(enterpriseProfile.frameguard).toEqual({ action: "DENY" });
		expect(enterpriseProfile.coep).toEqual({ policy: "require-corp" });
		expect(enterpriseProfile.xPoweredBy).toBe(false);
	});

	test("productionProfile configures strict 1-year HSTS and origin policies", () => {
		expect(productionProfile.csp).toBe(true);
		expect(productionProfile.hsts).toEqual({
			maxAge: 31536000,
			includeSubDomains: true,
			preload: true,
		});
		expect(productionProfile.frameguard).toEqual({ action: "DENY" });
		expect(productionProfile.referrerPolicy).toEqual({
			policy: "strict-origin-when-cross-origin",
		});
	});
});