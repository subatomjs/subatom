import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { createRateLimitMiddleware } from "../../../../../package/core/securities/rate-limits/rateLimit.middleware.js";
import { MemoryStore } from "../../../../../package/core/securities/rate-limits/stores/memory.store.js";

describe("createRateLimitMiddleware Integration", () => {
    let mockReq: any;
    let mockRes: any;
    let next: Mock<(err?: any) => void>;
    let store: MemoryStore;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-18T12:00:00.000Z"));

        store = new MemoryStore();
        mockReq = {
            ip: "127.0.0.1",
            headers: {},
        };

        const headersMap: Record<string, any> = {};
        mockRes = {
            headersSent: false,
            setHeader: vi.fn((key: string, val: any) => {
                headersMap[key] = val;
            }),
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            end: vi.fn().mockReturnThis(),
            _headers: headersMap,
        };

        next = vi.fn<(err?: any) => void>();
    });

    afterEach(async () => {
        await store.close();
        vi.useRealTimers();
    });

    it("should allow request and call next() within limit", async () => {
        const middleware = createRateLimitMiddleware({
            limit: 2,
            window: "1m",
            store,
        });

        await middleware(mockReq, mockRes, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(mockRes.status).not.toHaveBeenCalled();
        expect(mockRes.setHeader).toHaveBeenCalledWith("RateLimit-Limit", 2);
        expect(mockRes.setHeader).toHaveBeenCalledWith("RateLimit-Remaining", 1);
    });

    it("should respond with 429 when rate limit is exceeded", async () => {
        const onLimitExceeded = vi.fn();
        const middleware = createRateLimitMiddleware({
            limit: 1,
            window: "1m",
            store,
            onLimitExceeded,
        });

        await middleware(mockReq, mockRes, next);
        expect(next).toHaveBeenCalledTimes(1);

        // Second request triggers 429
        const blockedRes = { ...mockRes, status: vi.fn().mockReturnThis(), json: vi.fn() };
        await middleware(mockReq, blockedRes, next);

        expect(next).toHaveBeenCalledTimes(1); // Not called again
        expect(onLimitExceeded).toHaveBeenCalledWith(
            mockReq,
            blockedRes,
            expect.objectContaining({ allowed: false, remaining: 0 }),
        );
        expect(blockedRes.status).toHaveBeenCalledWith(429);
        expect(blockedRes.json).toHaveBeenCalledWith({
            error: "Too Many Requests",
            retryAfterMs: 60000,
        });
    });

    it("should handle response object without .status/.json methods by calling res.end()", async () => {
        const rawRes = {
            headersSent: false,
            setHeader: vi.fn(),
            end: vi.fn(),
        };

        const middleware = createRateLimitMiddleware({
            limit: 1,
            window: "1m",
            store,
        });

        await middleware(mockReq, rawRes, next);
        await middleware(mockReq, rawRes, next);

        expect(rawRes.end).toHaveBeenCalledTimes(1);
    });

    describe("Store Error Handling & Failure Modes", () => {
        it("should fail-open and call next() when store throws error", async () => {
            const failingStore = {
                evaluate: vi.fn().mockRejectedValue(new Error("Redis cluster unreachable")),
            };
            const onStoreError = vi.fn();

            const middleware = createRateLimitMiddleware({
                limit: 5,
                store: failingStore as any,
                failureMode: "fail-open",
                onStoreError,
            });

            await middleware(mockReq, mockRes, next);

            expect(onStoreError).toHaveBeenCalledWith(
                expect.any(Error),
                mockReq,
            );
            expect(next).toHaveBeenCalledTimes(1);
        });

        it("should fail-closed and return 500 when failureMode is fail-closed", async () => {
            const failingStore = {
                evaluate: vi.fn().mockRejectedValue(new Error("Store offline")),
            };

            const middleware = createRateLimitMiddleware({
                limit: 5,
                store: failingStore as any,
                failureMode: "fail-closed",
            });

            await middleware(mockReq, mockRes, next);

            expect(next).not.toHaveBeenCalled();
            expect(mockRes.status).toHaveBeenCalledWith(500);
            expect(mockRes.json).toHaveBeenCalledWith({
                error: "Rate Limiter Failure",
            });
        });

        it("should fallback to res.end() on failure-closed when res.status is absent", async () => {
            const failingStore = {
                evaluate: vi.fn().mockRejectedValue(new Error("Store offline")),
            };
            const rawRes = {
                headersSent: false,
                setHeader: vi.fn(),
                end: vi.fn(),
            };

            const middleware = createRateLimitMiddleware({
                limit: 5,
                store: failingStore as any,
                failureMode: "fail-closed",
            });

            await middleware(mockReq, rawRes, next);

            expect(rawRes.end).toHaveBeenCalledTimes(1);
        });
    });
});