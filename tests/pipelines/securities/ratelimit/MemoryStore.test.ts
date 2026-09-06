import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryStore } from "../../../../packages/pipelines/securities/ratelimit/stores/MemoryStore.js";
import type { StoreEvalParams } from "../../../../packages/pipelines/securities/ratelimit/types/rateLimit.types.js";

describe("MemoryStore", () => {
	let store: MemoryStore;

	beforeEach(() => {
		vi.useFakeTimers();
		store = new MemoryStore(60000);
	});

	afterEach(async () => {
		await store.close();
		vi.useRealTimers();
	});

	describe("lifecycle & guards", () => {
		it("should throw error on evaluate if store is closed", async () => {
			await store.close();
			const params: StoreEvalParams = {
				key: "k1",
				algorithm: "fixed-window",
				limit: 5,
				windowMs: 1000,
				capacity: 5,
				refillRate: 1,
				refillIntervalMs: 1000,
				now: Date.now(),
			};

			await expect(store.evaluate(params)).rejects.toThrow(
				"MemoryStore is closed.",
			);
		});

		it("should clear cache and stop gc timer on destroy", async () => {
			const params: StoreEvalParams = {
				key: "k1",
				algorithm: "fixed-window",
				limit: 5,
				windowMs: 1000,
				capacity: 5,
				refillRate: 1,
				refillIntervalMs: 1000,
				now: Date.now(),
			};
			await store.evaluate(params);
			await store.destroy();
			// Re-closing should be idempotent
			await expect(store.close()).resolves.toBeUndefined();
		});

		it("should garbage collect expired entries after cleanup window", async () => {
			const now = 100000;
			vi.setSystemTime(now);

			await store.evaluate({
				key: "expire-me",
				algorithm: "fixed-window",
				limit: 1,
				windowMs: 5000,
				capacity: 1,
				refillRate: 1,
				refillIntervalMs: 5000,
				now,
			});

			// Advance beyond resetAt + 10,000ms GC grace period
			vi.setSystemTime(now + 16000);
			vi.advanceTimersByTime(60000);

			// Accessing the key now should treat it as fresh
			const freshResult = await store.evaluate({
				key: "expire-me",
				algorithm: "fixed-window",
				limit: 1,
				windowMs: 5000,
				capacity: 1,
				refillRate: 1,
				refillIntervalMs: 5000,
				now: now + 16000,
			});

			expect(freshResult.allowed).toBe(true);
			expect(freshResult.remaining).toBe(0);
		});
	});

	describe("algorithm: fixed-window", () => {
		it("should allow requests up to limit and block when exceeded", async () => {
			const now = 1000;
			const p: StoreEvalParams = {
				key: "user-1",
				algorithm: "fixed-window",
				limit: 2,
				windowMs: 10000,
				capacity: 2,
				refillRate: 1,
				refillIntervalMs: 10000,
				now,
			};

			const r1 = await store.evaluate(p);
			expect(r1).toEqual({ allowed: true, remaining: 1, resetMs: 10000 });

			const r2 = await store.evaluate(p);
			expect(r2).toEqual({ allowed: true, remaining: 0, resetMs: 10000 });

			const r3 = await store.evaluate(p);
			expect(r3).toEqual({ allowed: false, remaining: 0, resetMs: 10000 });
		});

		it("should reset counter when current time exceeds resetAt window", async () => {
			const now = 1000;
			const p: StoreEvalParams = {
				key: "user-reset",
				algorithm: "fixed-window",
				limit: 1,
				windowMs: 5000,
				capacity: 1,
				refillRate: 1,
				refillIntervalMs: 5000,
				now,
			};

			await store.evaluate(p);
			const blocked = await store.evaluate(p);
			expect(blocked.allowed).toBe(false);

			const rAfterWindow = await store.evaluate({ ...p, now: now + 6000 });
			expect(rAfterWindow.allowed).toBe(true);
			expect(rAfterWindow.remaining).toBe(0);
		});
	});

	describe("algorithm: sliding-window", () => {
		it("should correctly prune old requests from history", async () => {
			const baseTime = 10000;
			const p = (now: number): StoreEvalParams => ({
				key: "sliding-user",
				algorithm: "sliding-window",
				limit: 2,
				windowMs: 5000,
				capacity: 2,
				refillRate: 0,
				refillIntervalMs: 5000,
				now,
			});

			const r1 = await store.evaluate(p(baseTime));
			expect(r1.allowed).toBe(true);
			expect(r1.remaining).toBe(1);

			const r2 = await store.evaluate(p(baseTime + 1000));
			expect(r2.allowed).toBe(true);
			expect(r2.remaining).toBe(0);

			// Exceeded: history is now [10000, 11000, 12000]
			const r3 = await store.evaluate(p(baseTime + 2000));
			expect(r3.allowed).toBe(false);
			expect(r3.remaining).toBe(0);

			// Advance beyond 11000 (11000 + 5000 = 16000), e.g. baseTime + 6500 = 16500
			// Prunes 10000 and 11000, leaving [12000] -> new history becomes [12000, 16500] (len 2 <= 2)
			const r4 = await store.evaluate(p(baseTime + 6500));
			expect(r4.allowed).toBe(true);
			expect(r4.remaining).toBe(0);
		});
	});

	describe("algorithm: token-bucket", () => {
		it("should consume tokens and refill according to interval and rate", async () => {
			const now = 1000;
			const p = (currentTime: number): StoreEvalParams => ({
				key: "token-user",
				algorithm: "token-bucket",
				limit: 2,
				capacity: 2,
				windowMs: 2000,
				refillRate: 1,
				refillIntervalMs: 1000,
				now: currentTime,
			});

			const r1 = await store.evaluate(p(now));
			expect(r1.allowed).toBe(true);
			expect(r1.remaining).toBe(1);

			const r2 = await store.evaluate(p(now));
			expect(r2.allowed).toBe(true);
			expect(r2.remaining).toBe(0);

			const r3 = await store.evaluate(p(now));
			expect(r3.allowed).toBe(false);
			expect(r3.remaining).toBe(0);

			// Refill 1 token after 1000ms
			const r4 = await store.evaluate(p(now + 1000));
			expect(r4.allowed).toBe(true);
			expect(r4.remaining).toBe(0);
		});

		it("should not exceed maximum capacity during refills", async () => {
			const now = 1000;
			const p = (currentTime: number): StoreEvalParams => ({
				key: "token-cap",
				algorithm: "token-bucket",
				limit: 2,
				capacity: 2,
				windowMs: 2000,
				refillRate: 10,
				refillIntervalMs: 1000,
				now: currentTime,
			});

			await store.evaluate(p(now));
			// Advance time significantly
			const res = await store.evaluate(p(now + 10000));
			expect(res.remaining).toBe(1); // Capacity is capped at 2, minus 1 consumed
		});
	});
});
