import { describe, test, expect, vi } from "vitest";
import type { IRequest } from "../../../packages/core/http/request/types/request.types.js";
import type { IResponse } from "../../../packages/core/http/response/types/response.types.js";
import type { NextFunction } from "../../../packages/pipelines/next/types/nextFunction.types.js";
import { SECURITY_HEADERS } from "../../../packages/security/security.constant.header.js";
import {
	createContentSecurityPolicyMiddleware,
	serializeContentSecurityPolicy,
} from "../../../packages/security/headers/contentSecurityPolicy.js";
import { createContentTypeOptionsMiddleware } from "../../../packages/security/headers/contentTypeOptions.js";
import { createCrossOriginEmbedderPolicyMiddleware } from "../../../packages/security/headers/crossOriginEmbedderPolicy.js";
import { createCOOPMiddleware } from "../../../packages/security/headers/crossOriginOpenerPolicy.js";
import { createCORPMiddleware } from "../../../packages/security/headers/crossOriginResourcePolicy.js";
import { createDNSPrefetchControlMiddleware } from "../../../packages/security/headers/dnsPrefetchControl.js";
import { createDownloadOptionsMiddleware } from "../../../packages/security/headers/downloadOptions.js";
import { createFrameguardMiddleware } from "../../../packages/security/headers/frameguard.js";
import { createOriginAgentClusterMiddleware } from "../../../packages/security/headers/originAgentCluster.js";
import {
	createPermissionsPolicyMiddleware,
	serializePermissionsPolicy,
} from "../../../packages/security/headers/permissionsPolicy.js";
import { createReferrerPolicyMiddleware } from "../../../packages/security/headers/referrerPolicy.js";
import { createHSTSMiddleware } from "../../../packages/security/headers/strictTransportSecurity.js";
import { createXPoweredByMiddleware } from "../../../packages/security/headers/xPoweredBy.js";

const createMockReqRes = (): {
	req: IRequest;
	res: IResponse;
	next: NextFunction;
	setHeader: ReturnType<typeof vi.fn>;
	removeHeader: ReturnType<typeof vi.fn>;
} => {
	const setHeader = vi.fn();
	const removeHeader = vi.fn();
	const req = {} as IRequest;
	const res = {
		headersSent: false,
		setHeader,
		removeHeader,
	} as unknown as IResponse;
	const next = vi.fn() as NextFunction;

	return { req, res, next, setHeader, removeHeader };
};

describe("Security Middleware Factories", () => {
	describe("Content-Security-Policy", () => {
		test("serializes directives properly", () => {
			const serialized = serializeContentSecurityPolicy({
				"default-src": ["'self'"],
				"upgrade-insecure-requests": true,
				"empty-directive": [],
			});
			expect(serialized).toBe("default-src 'self'; upgrade-insecure-requests");
		});

		test("sets CSP header on response with defaults", () => {
			const mw = createContentSecurityPolicyMiddleware();
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.CSP,
				expect.stringContaining("default-src 'self'"),
			);
			expect(next).toHaveBeenCalledTimes(1);
		});

		test("sets CSP Report-Only header when reportOnly is true", () => {
			const mw = createContentSecurityPolicyMiddleware({
				reportOnly: true,
				directives: { "default-src": ["'self'"] },
			});
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.CSP_REPORT_ONLY,
				"default-src 'self'",
			);
		});

		test("bypasses header setting when options is false", () => {
			const mw = createContentSecurityPolicyMiddleware(false);
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalledTimes(1);
		});

		test("handles empty directives gracefully without setting header", () => {
			const mw = createContentSecurityPolicyMiddleware({ directives: {} });
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalledTimes(1);
		});
	});

	describe("X-Content-Type-Options", () => {
		test("sets nosniff when enabled", () => {
			const mw = createContentTypeOptionsMiddleware(true);
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.X_CONTENT_TYPE_OPTIONS,
				"nosniff",
			);
			expect(next).toHaveBeenCalledTimes(1);
		});

		test("skips header when disabled", () => {
			const mw = createContentTypeOptionsMiddleware(false);
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalledTimes(1);
		});
	});

	describe("Cross-Origin-Embedder-Policy (COEP)", () => {
		test("sets default require-corp policy", () => {
			const mw = createCrossOriginEmbedderPolicyMiddleware();
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.COEP,
				"require-corp",
			);
			expect(next).toHaveBeenCalledTimes(1);
		});

		test("sets custom policy", () => {
			const mw = createCrossOriginEmbedderPolicyMiddleware({
				policy: "credentialless",
			});
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.COEP,
				"credentialless",
			);
		});

		test("skips when disabled via false", () => {
			const mw = createCrossOriginEmbedderPolicyMiddleware(false);
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalledTimes(1);
		});
	});

	describe("Cross-Origin-Opener-Policy (COOP)", () => {
		test("sets default same-origin policy", () => {
			const mw = createCOOPMiddleware();
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.COOP,
				"same-origin",
			);
			expect(next).toHaveBeenCalledTimes(1);
		});

		test("sets custom policy", () => {
			const mw = createCOOPMiddleware({ policy: "same-origin-allow-popups" });
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.COOP,
				"same-origin-allow-popups",
			);
		});

		test("skips when disabled via false", () => {
			const mw = createCOOPMiddleware(false);
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalledTimes(1);
		});
	});

	describe("Cross-Origin-Resource-Policy (CORP)", () => {
		test("sets default same-origin policy", () => {
			const mw = createCORPMiddleware();
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.CORP,
				"same-origin",
			);
			expect(next).toHaveBeenCalledTimes(1);
		});

		test("sets custom policy", () => {
			const mw = createCORPMiddleware({ policy: "cross-origin" });
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.CORP,
				"cross-origin",
			);
		});

		test("skips when disabled via false", () => {
			const mw = createCORPMiddleware(false);
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalledTimes(1);
		});
	});

	describe("DNS Prefetch Control", () => {
		test("sets off by default", () => {
			const mw = createDNSPrefetchControlMiddleware();
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.X_DNS_PREFETCH_CONTROL,
				"off",
			);
		});

		test("sets on when allow is true via object", () => {
			const mw = createDNSPrefetchControlMiddleware({ allow: true });
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.X_DNS_PREFETCH_CONTROL,
				"on",
			);
		});

		test("sets on when boolean true is passed", () => {
			const mw = createDNSPrefetchControlMiddleware(true);
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.X_DNS_PREFETCH_CONTROL,
				"on",
			);
		});
	});

	describe("Download Options", () => {
		test("sets noopen when enabled", () => {
			const mw = createDownloadOptionsMiddleware();
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.X_DOWNLOAD_OPTIONS,
				"noopen",
			);
		});

		test("skips when disabled", () => {
			const mw = createDownloadOptionsMiddleware(false);
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).not.toHaveBeenCalled();
		});
	});

	describe("Frameguard", () => {
		test("sets SAMEORIGIN by default", () => {
			const mw = createFrameguardMiddleware();
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.X_FRAME_OPTIONS,
				"SAMEORIGIN",
			);
		});

		test("sets DENY when specified", () => {
			const mw = createFrameguardMiddleware({ action: "DENY" });
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.X_FRAME_OPTIONS,
				"DENY",
			);
		});

		test("skips when disabled via false", () => {
			const mw = createFrameguardMiddleware(false);
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).not.toHaveBeenCalled();
		});
	});

	describe("Origin-Agent-Cluster", () => {
		test("sets ?1 when enabled", () => {
			const mw = createOriginAgentClusterMiddleware();
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.ORIGIN_AGENT_CLUSTER,
				"?1",
			);
		});

		test("skips when disabled", () => {
			const mw = createOriginAgentClusterMiddleware(false);
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).not.toHaveBeenCalled();
		});
	});

	describe("Permissions Policy", () => {
		test("serializes empty, wildcard, self, and quoted origins properly", () => {
			const serialized = serializePermissionsPolicy({
				camera: [],
				fullscreen: ["self", "*"],
				geolocation: ["https://example.com"],
				unsupported: undefined,
			});
			expect(serialized).toBe(
				'camera=(), fullscreen=(self *), geolocation=("https://example.com")',
			);
		});

		test("sets Permissions-Policy header with defaults", () => {
			const mw = createPermissionsPolicyMiddleware();
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.PERMISSIONS_POLICY,
				expect.stringContaining("camera=()"),
			);
		});

		test("skips when disabled via false", () => {
			const mw = createPermissionsPolicyMiddleware(false);
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).not.toHaveBeenCalled();
		});

		test("skips setting header when serialized output is empty", () => {
			const mw = createPermissionsPolicyMiddleware({ features: {} });
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).not.toHaveBeenCalled();
		});
	});

	describe("Referrer-Policy", () => {
		test("sets default no-referrer", () => {
			const mw = createReferrerPolicyMiddleware();
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.REFERRER_POLICY,
				"no-referrer",
			);
		});

		test("supports array of policies joined by comma", () => {
			const mw = createReferrerPolicyMiddleware({
				policy: ["no-referrer", "strict-origin-when-cross-origin"],
			});
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.REFERRER_POLICY,
				"no-referrer, strict-origin-when-cross-origin",
			);
		});

		test("skips when disabled via false", () => {
			const mw = createReferrerPolicyMiddleware(false);
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).not.toHaveBeenCalled();
		});
	});

	describe("Strict-Transport-Security (HSTS)", () => {
		test("sets default HSTS header with maxAge and includeSubDomains", () => {
			const mw = createHSTSMiddleware();
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.HSTS,
				"max-age=15552000; includeSubDomains",
			);
		});

		test("includes preload directive when enabled", () => {
			const mw = createHSTSMiddleware({
				maxAge: 31536000,
				includeSubDomains: true,
				preload: true,
			});
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.HSTS,
				"max-age=31536000; includeSubDomains; preload",
			);
		});

		test("skips when disabled via false", () => {
			const mw = createHSTSMiddleware(false);
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).not.toHaveBeenCalled();
		});
	});

	describe("X-Powered-By", () => {
		test("removes header when value is false", () => {
			const mw = createXPoweredByMiddleware(false);
			const { req, res, next, removeHeader } = createMockReqRes();

			mw(req, res, next);
			expect(removeHeader).toHaveBeenCalledWith(SECURITY_HEADERS.X_POWERED_BY);
			expect(next).toHaveBeenCalledTimes(1);
		});

		test("sets custom string value", () => {
			const mw = createXPoweredByMiddleware("CustomServer");
			const { req, res, next, setHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).toHaveBeenCalledWith(
				SECURITY_HEADERS.X_POWERED_BY,
				"CustomServer",
			);
			expect(next).toHaveBeenCalledTimes(1);
		});

		test("does not touch header when value is true (noop)", () => {
			const mw = createXPoweredByMiddleware(true);
			const { req, res, next, setHeader, removeHeader } = createMockReqRes();

			mw(req, res, next);
			expect(setHeader).not.toHaveBeenCalled();
			expect(removeHeader).not.toHaveBeenCalled();
			expect(next).toHaveBeenCalledTimes(1);
		});
	});
});