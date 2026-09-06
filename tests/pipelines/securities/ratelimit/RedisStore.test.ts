import { beforeEach, describe, expect, it, vi } from "vitest";
import { RedisStore } from "../../../../packages/pipelines/securities/ratelimit/stores/RedisStore.js";
import type {
	RedisClientLike,
	StoreEvalParams,
} from "../../../../packages/pipelines/securities/ratelimit/types/rateLimit.types.js";

describe("RedisStore", () => {
	let mockRedisClient: RedisClientLike;

	beforeEach(() => {
		mockRedisClient = {
			eval: vi.fn(),
		};
	});

	it("should throw error if evaluate is called after close", async () => {
		const store = new RedisStore(mockRedisClient);
		await store.close();

		const p: StoreEvalParams = {
			key: "any",
			algorithm: "fixed-window",
			limit: 10,
			windowMs: 1000,
			capacity: 10,
			refillRate: 1,
			refillIntervalMs: 1000,
			now: Date.now(),
		};

		await expect(store.evaluate(p)).rejects.toThrow("RedisStore is closed.");
		await store.destroy();
	});

	describe("evaluation algorithms", () => {
		it("should evaluate fixed-window algorithm properly", async () => {
			const store = new RedisStore(mockRedisClient);
			vi.mocked(mockRedisClient.eval).mockResolvedValue([1, 5000]);

			const res = await store.evaluate({
				key: "test-fixed",
				algorithm: "fixed-window",
				limit: 5,
				windowMs: 5000,
				capacity: 5,
				refillRate: 1,
				refillIntervalMs: 5000,
				now: 1000,
			});

			expect(res).toEqual({
				allowed: true,
				remaining: 4,
				resetMs: 5000,
			});
			expect(mockRedisClient.eval).toHaveBeenCalledWith(
				expect.stringContaining("INCR"),
				1,
				"rl:test-fixed",
				5,
				5000,
			);
		});

		it("should fallback resetMs to windowMs if redis PTTL returns <= 0 in fixed-window", async () => {
			const store = new RedisStore(mockRedisClient);
			vi.mocked(mockRedisClient.eval).mockResolvedValue([10, -1]);

			const res = await store.evaluate({
				key: "test-fixed",
				algorithm: "fixed-window",
				limit: 5,
				windowMs: 3000,
				capacity: 5,
				refillRate: 1,
				refillIntervalMs: 3000,
				now: 1000,
			});

			expect(res.allowed).toBe(false);
			expect(res.remaining).toBe(0);
			expect(res.resetMs).toBe(3000);
		});

		it("should evaluate sliding-window algorithm properly", async () => {
			const store = new RedisStore(mockRedisClient);
			vi.mocked(mockRedisClient.eval).mockResolvedValue([1, 2, 4500]);

			const res = await store.evaluate({
				key: "test-sliding",
				algorithm: "sliding-window",
				limit: 5,
				windowMs: 5000,
				capacity: 5,
				refillRate: 1,
				refillIntervalMs: 5000,
				now: 1000,
			});

			expect(res).toEqual({
				allowed: true,
				remaining: 2,
				resetMs: 4500,
			});
			expect(mockRedisClient.eval).toHaveBeenCalledWith(
				expect.stringContaining("ZREMRANGEBYSCORE"),
				1,
				"rl:test-sliding",
				1000,
				5000,
				5,
				expect.any(String),
			);
		});

		it("should evaluate token-bucket algorithm properly", async () => {
			const store = new RedisStore(mockRedisClient);
			vi.mocked(mockRedisClient.eval).mockResolvedValue([1, 3, 1000]);

			const res = await store.evaluate({
				key: "test-token",
				algorithm: "token-bucket",
				limit: 5,
				windowMs: 5000,
				capacity: 5,
				refillRate: 2,
				refillIntervalMs: 1000,
				now: 2000,
			});

			expect(res).toEqual({
				allowed: true,
				remaining: 3,
				resetMs: 1000,
			});
			expect(mockRedisClient.eval).toHaveBeenCalledWith(
				expect.stringContaining("HMGET"),
				1,
				"rl:test-token",
				5,
				2,
				1000,
				2000,
			);
		});
	});

	describe("resilience, retries, and circuit breaker", () => {
		it("should retry on evaluation failure up to retries count", async () => {
			const store = new RedisStore(mockRedisClient, {
				retries: 2,
				retryDelayMs: 5,
			});

			vi.mocked(mockRedisClient.eval)
				.mockRejectedValueOnce(new Error("Redis transient socket drop"))
				.mockResolvedValueOnce([1, 1000]);

			const p: StoreEvalParams = {
				key: "retry-test",
				algorithm: "fixed-window",
				limit: 10,
				windowMs: 1000,
				capacity: 10,
				refillRate: 1,
				refillIntervalMs: 1000,
				now: 1000,
			};

			const res = await store.evaluate(p);
			expect(res.allowed).toBe(true);
			expect(mockRedisClient.eval).toHaveBeenCalledTimes(2);
		});

		it("should trip circuit breaker when failure threshold is reached", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			const store = new RedisStore(mockRedisClient, {
				retries: 0,
				failureThreshold: 2,
				cooldownMs: 5000,
			});

			vi.mocked(mockRedisClient.eval).mockRejectedValue(
				new Error("Redis offline"),
			);

			const p: StoreEvalParams = {
				key: "circuit-key",
				algorithm: "fixed-window",
				limit: 10,
				windowMs: 1000,
				capacity: 10,
				refillRate: 1,
				refillIntervalMs: 1000,
				now: 1000,
			};

			// Failure 1
			await expect(store.evaluate(p)).rejects.toThrow("Redis offline");
			// Failure 2 -> Threshold reached
			await expect(store.evaluate(p)).rejects.toThrow("Redis offline");
			expect(warnSpy).toHaveBeenCalledWith(
				"[Subatom RateLimit] Redis circuit opened after repeated failures.",
			);

			// In cooldown -> immediate short-circuit without calling eval
			await expect(store.evaluate(p)).rejects.toThrow(
				"Redis rate-limit circuit is open.",
			);
			expect(mockRedisClient.eval).toHaveBeenCalledTimes(2);

			warnSpy.mockRestore();
		});

		it("should abort and reject when Redis query times out", async () => {
			const store = new RedisStore(mockRedisClient, {
				timeoutMs: 10,
				retries: 0,
			});

			// Never resolving promise to simulate timeout
			vi.mocked(mockRedisClient.eval).mockImplementation(
				() => new Promise((resolve) => setTimeout(resolve, 50)),
			);

			const p: StoreEvalParams = {
				key: "timeout-key",
				algorithm: "fixed-window",
				limit: 10,
				windowMs: 1000,
				capacity: 10,
				refillRate: 1,
				refillIntervalMs: 1000,
				now: 1000,
			};

			await expect(store.evaluate(p)).rejects.toThrow(
				"Redis rate-limit call timed out.",
			);
		});
	});
});
