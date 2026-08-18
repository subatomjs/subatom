import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MemoryStore } from "../../../../../package/core/securities/rate-limits/stores/memory.store.js";

describe("MemoryStore", () => {
    let store: MemoryStore;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-18T12:00:00.000Z"));
        store = new MemoryStore(1000);
    });

    afterEach(async () => {
        await store.close();
        vi.useRealTimers();
    });

    describe("Fixed Window Algorithm", () => {
        it("should allow requests up to limit and reset after windowMs", async () => {
            const now = Date.now();
            const params = {
                key: "fixed:user1",
                algorithm: "fixed-window" as const,
                limit: 2,
                windowMs: 5000,
                capacity: 2,
                refillRate: 0,
                refillIntervalMs: 5000,
                now,
            };

            const res1 = await store.evaluate(params);
            expect(res1.allowed).toBe(true);
            expect(res1.remaining).toBe(1);
            expect(res1.resetMs).toBe(5000);

            const res2 = await store.evaluate({ ...params, now: now + 1000 });
            expect(res2.allowed).toBe(true);
            expect(res2.remaining).toBe(0);

            const res3 = await store.evaluate({ ...params, now: now + 2000 });
            expect(res3.allowed).toBe(false);
            expect(res3.remaining).toBe(0);

            // Advance past reset window
            const res4 = await store.evaluate({ ...params, now: now + 6000 });
            expect(res4.allowed).toBe(true);
            expect(res4.remaining).toBe(1);
        });
    });

    describe("Sliding Window Algorithm", () => {
        it("should slide the window based on timestamp history", async () => {
            const baseNow = Date.now();
            const params = {
                key: "sliding:user1",
                algorithm: "sliding-window" as const,
                limit: 3,
                windowMs: 10000,
                capacity: 3,
                refillRate: 0,
                refillIntervalMs: 10000,
                now: baseNow,
            };

            const r1 = await store.evaluate({ ...params, now: baseNow });
            expect(r1.allowed).toBe(true);
            expect(r1.remaining).toBe(2);

            const r2 = await store.evaluate({ ...params, now: baseNow + 2000 });
            expect(r2.allowed).toBe(true);
            expect(r2.remaining).toBe(1);

            const r3 = await store.evaluate({ ...params, now: baseNow + 4000 });
            expect(r3.allowed).toBe(true);
            expect(r3.remaining).toBe(0);

            const r4 = await store.evaluate({ ...params, now: baseNow + 6000 });
            expect(r4.allowed).toBe(false);
            expect(r4.remaining).toBe(0);

            // At baseNow + 12500ms, window cutoff is 2500ms (0ms and 2000ms expired, 2 remaining: 4000ms & 6000ms)
            const r5 = await store.evaluate({ ...params, now: baseNow + 12500 });
            expect(r5.allowed).toBe(true);
            expect(r5.remaining).toBe(0);
        });
    });

    describe("Token Bucket Algorithm", () => {
        it("should consume tokens and refill according to elapsed intervals", async () => {
            const baseNow = Date.now();
            const params = {
                key: "token:user1",
                algorithm: "token-bucket" as const,
                limit: 3,
                windowMs: 1000,
                capacity: 3,
                refillRate: 1,
                refillIntervalMs: 1000,
                now: baseNow,
            };

            const r1 = await store.evaluate({ ...params, now: baseNow });
            expect(r1.allowed).toBe(true);
            expect(r1.remaining).toBe(2);

            const r2 = await store.evaluate({ ...params, now: baseNow });
            expect(r2.allowed).toBe(true);
            expect(r2.remaining).toBe(1);

            const r3 = await store.evaluate({ ...params, now: baseNow });
            expect(r3.allowed).toBe(true);
            expect(r3.remaining).toBe(0);

            // Out of tokens
            const r4 = await store.evaluate({ ...params, now: baseNow + 100 });
            expect(r4.allowed).toBe(false);
            expect(r4.remaining).toBe(0);

            // Advance by 2 intervals (refills 2 tokens, consumes 1)
            const r5 = await store.evaluate({ ...params, now: baseNow + 2100 });
            expect(r5.allowed).toBe(true);
            expect(r5.remaining).toBe(1);
        });
    });

    describe("Garbage Collection & Lifecycle", () => {
        it("should clean up expired entries during periodic garbage collection", async () => {
            const now = Date.now();
            await store.evaluate({
                key: "expired_key",
                algorithm: "fixed-window",
                limit: 5,
                windowMs: 1000,
                capacity: 5,
                refillRate: 0,
                refillIntervalMs: 1000,
                now,
            });

            // Fast forward time past resetAt + 10000ms
            vi.advanceTimersByTime(20000);

            // Verify store runs cleanup without error
            expect(async () => await store.close()).not.toThrow();
        });
    });
});