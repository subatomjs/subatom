import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TokenBucket } from "../../../package/core/websocket/services/rateLimiter.service.js";

describe("TokenBucket Rate Limiter", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000_000);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should initialize with full capacity and consume default cost 1", () => {
		const bucket = new TokenBucket(5, 1);
		expect(bucket.tryConsume()).toBe(true);
		expect(bucket.tryConsume()).toBe(true);
		expect(bucket.tryConsume()).toBe(true);
		expect(bucket.tryConsume()).toBe(true);
		expect(bucket.tryConsume()).toBe(true);
		expect(bucket.tryConsume()).toBe(false);
	});

	it("should allow consuming custom cost amounts", () => {
		const bucket = new TokenBucket(10, 2);
		expect(bucket.tryConsume(6)).toBe(true);
		expect(bucket.tryConsume(5)).toBe(false); // only 4 tokens remaining
		expect(bucket.tryConsume(4)).toBe(true); // exactly 4 tokens consumed
		expect(bucket.tryConsume(1)).toBe(false);
	});

	it("should refill tokens deterministically based on elapsed time", () => {
		const bucket = new TokenBucket(10, 2); // 2 tokens per second
		expect(bucket.tryConsume(10)).toBe(true);
		expect(bucket.tryConsume(1)).toBe(false);

		// Advance by 1.5 seconds (3 tokens refilled)
		vi.advanceTimersByTime(1500);
		expect(bucket.tryConsume(3)).toBe(true);
		expect(bucket.tryConsume(1)).toBe(false);
	});

	it("should never refill past max capacity", () => {
		const bucket = new TokenBucket(5, 5);
		expect(bucket.tryConsume(2)).toBe(true); // 3 remaining

		// Wait 10 seconds (would generate 50 tokens without clamp)
		vi.advanceTimersByTime(10_000);

		// Should only be capped at 5
		expect(bucket.tryConsume(5)).toBe(true);
		expect(bucket.tryConsume(1)).toBe(false);
	});

	it("should handle zero or negative elapsed time without mutating tokens", () => {
		const bucket = new TokenBucket(5, 2);
		expect(bucket.tryConsume(3)).toBe(true); // 2 remaining

		// Time stays identical
		expect(bucket.tryConsume(2)).toBe(true);
		expect(bucket.tryConsume(1)).toBe(false);
	});
});
