import { describe, expect, it, vi } from "vitest";
import { applyHeaders } from "../../../../packages/pipelines/securities/ratelimit/applyHeaders.js";
import type { IResponse } from "../../../../packages/core/http/response/types/response.types.js";
import type { HeaderConfig, RateLimitResult } from "../../../../packages/pipelines/securities/ratelimit/types/rateLimit.types.js";

describe("applyHeaders", () => {
	const createMockResponse = (headersSent = false) => {
		const headers = new Map<string, string | number>();
		return {
			headersSent,
			setHeader: vi.fn((key: string, value: string | number) => {
				headers.set(key, value);
			}),
			_headers: headers,
		} as unknown as IResponse & { _headers: Map<string, string | number> };
	};

	const baseMeta: RateLimitResult = {
		allowed: true,
		limit: 100,
		remaining: 99,
		resetMs: 1500,
		policyName: "default",
	};

	const fullConfig: Required<HeaderConfig> = {
		standard: true,
		legacy: true,
		retryAfter: true,
	};

	it("should not set any headers if res.headersSent is true", () => {
		const res = createMockResponse(true);
		applyHeaders(res, baseMeta, fullConfig);

		expect(res.setHeader).not.toHaveBeenCalled();
	});

	it("should set standard RateLimit headers when enabled", () => {
		const res = createMockResponse();
		applyHeaders(res, baseMeta, { standard: true, legacy: false, retryAfter: false });

		expect(res.setHeader).toHaveBeenCalledWith("RateLimit-Limit", 100);
		expect(res.setHeader).toHaveBeenCalledWith("RateLimit-Remaining", 99);
		expect(res.setHeader).toHaveBeenCalledWith("RateLimit-Reset", 2); // Math.ceil(1500 / 1000)
		expect(res.setHeader).not.toHaveBeenCalledWith("X-RateLimit-Limit", expect.anything());
		expect(res.setHeader).not.toHaveBeenCalledWith("Retry-After", expect.anything());
	});

	it("should set legacy X-RateLimit headers with epoch timestamp when enabled", () => {
		const res = createMockResponse();
		const now = 1700000000000;
		vi.spyOn(Date, "now").mockReturnValue(now);

		applyHeaders(res, baseMeta, { standard: false, legacy: true, retryAfter: false });

		expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", 100);
		expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", 99);
		expect(res.setHeader).toHaveBeenCalledWith(
			"X-RateLimit-Reset",
			Math.ceil((now + 1500) / 1000),
		);
	});

	it("should set Retry-After header only when allowed is false and retryAfter config is true", () => {
		const resAllowed = createMockResponse();
		applyHeaders(resAllowed, { ...baseMeta, allowed: true }, fullConfig);
		expect(resAllowed.setHeader).not.toHaveBeenCalledWith("Retry-After", expect.anything());

		const resBlocked = createMockResponse();
		applyHeaders(resBlocked, { ...baseMeta, allowed: false, resetMs: 4200 }, fullConfig);
		expect(resBlocked.setHeader).toHaveBeenCalledWith("Retry-After", 5);
	});

	it("should not set Retry-After when request is blocked but retryAfter config is false", () => {
		const res = createMockResponse();
		applyHeaders(
			res,
			{ ...baseMeta, allowed: false },
			{ standard: true, legacy: false, retryAfter: false },
		);
		expect(res.setHeader).not.toHaveBeenCalledWith("Retry-After", expect.anything());
	});
});