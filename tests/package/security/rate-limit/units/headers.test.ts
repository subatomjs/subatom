import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { applyHeaders } from "../../../../../package/core/securities/rate-limits/headers.js";
import type { RateLimitResult } from "../../../../../package/core/securities/rate-limits/rateLimit.config.js";

describe("RateLimit Headers - applyHeaders", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-18T12:00:00.000Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const createMockRes = (headersSent = false) => {
        const headers: Record<string, any> = {};
        return {
            headersSent,
            setHeader: vi.fn((key: string, val: any) => {
                headers[key] = val;
            }),
            getHeader: (key: string) => headers[key],
            _headers: headers,
        };
    };

    it("should do nothing if res.headersSent is true", () => {
        const res = createMockRes(true);
        const meta: RateLimitResult = {
            allowed: true,
            limit: 100,
            remaining: 99,
            resetMs: 30000,
            policyName: "p1",
        };

        applyHeaders(res, meta, { standard: true, legacy: true, retryAfter: true });
        expect(res.setHeader).not.toHaveBeenCalled();
    });

    it("should apply standard RateLimit headers when enabled", () => {
        const res = createMockRes(false);
        const meta: RateLimitResult = {
            allowed: true,
            limit: 100,
            remaining: 99,
            resetMs: 45200,
            policyName: "default",
        };

        applyHeaders(res, meta, { standard: true, legacy: false, retryAfter: false });
        expect(res.setHeader).toHaveBeenCalledWith("RateLimit-Limit", 100);
        expect(res.setHeader).toHaveBeenCalledWith("RateLimit-Remaining", 99);
        expect(res.setHeader).toHaveBeenCalledWith("RateLimit-Reset", 46); // Math.ceil(45200 / 1000)
    });

    it("should apply legacy X-RateLimit headers when enabled", () => {
        const res = createMockRes(false);
        const nowMs = Date.now();
        const resetMs = 15000;
        const meta: RateLimitResult = {
            allowed: true,
            limit: 60,
            remaining: 50,
            resetMs,
            policyName: "default",
        };

        applyHeaders(res, meta, { standard: false, legacy: true, retryAfter: false });
        expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Limit", 60);
        expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", 50);
        expect(res.setHeader).toHaveBeenCalledWith(
            "X-RateLimit-Reset",
            Math.ceil((nowMs + resetMs) / 1000),
        );
    });

    it("should set Retry-After header only when allowed is false and retryAfter is enabled", () => {
        const resAllowed = createMockRes(false);
        const metaAllowed: RateLimitResult = {
            allowed: true,
            limit: 10,
            remaining: 5,
            resetMs: 12000,
            policyName: "default",
        };
        applyHeaders(resAllowed, metaAllowed, { standard: true, legacy: false, retryAfter: true });
        expect(resAllowed.setHeader).not.toHaveBeenCalledWith("Retry-After", expect.anything());

        const resBlocked = createMockRes(false);
        const metaBlocked: RateLimitResult = {
            allowed: false,
            limit: 10,
            remaining: 0,
            resetMs: 12100,
            policyName: "default",
        };
        applyHeaders(resBlocked, metaBlocked, { standard: true, legacy: false, retryAfter: true });
        expect(resBlocked.setHeader).toHaveBeenCalledWith("Retry-After", 13);
    });
});