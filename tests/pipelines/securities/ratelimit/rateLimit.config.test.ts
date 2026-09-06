import { describe, expect, it } from "vitest";
import {
	normalizeConfig,
	parseDuration,
} from "../../../../packages/pipelines/securities/ratelimit/rateLimit.config.js";
import { RateLimitConfigError } from "../../../../packages/errors/RateLimitError.js";
import type { RateLimitOptions } from "../../../../packages/pipelines/securities/ratelimit/types/rateLimit.types.js";

describe("rateLimit.config", () => {
	describe("parseDuration", () => {
		it("should return raw number if input is already a number", () => {
			expect(parseDuration(5000)).toBe(5000);
		});

		it("should parse duration strings with various units", () => {
			expect(parseDuration("500")).toBe(500); // ms default
			expect(parseDuration("10s")).toBe(10000);
			expect(parseDuration("2m")).toBe(120000);
			expect(parseDuration("1h")).toBe(3600000);
			expect(parseDuration("1d")).toBe(86400000);
		});

		it("should trim string inputs before parsing", () => {
			expect(parseDuration("  30s  ")).toBe(30000);
		});

		it("should throw RateLimitConfigError on invalid format", () => {
			expect(() => parseDuration("invalid")).toThrow(RateLimitConfigError);
			expect(() => parseDuration("10w")).toThrow(RateLimitConfigError);
			expect(() => parseDuration("")).toThrow(RateLimitConfigError);
		});
	});

	describe("normalizeConfig", () => {
		it("should normalize minimal root options into a default sliding-window policy", () => {
			const options: RateLimitOptions = {
				limit: 10,
				window: "1m",
			};

			const normalized = normalizeConfig(options);

			expect(normalized.policies).toHaveLength(1);
			expect(normalized.policies[0]).toEqual({
				name: "policy_0",
				algorithm: "sliding-window",
				limit: 10,
				windowMs: 60000,
				capacity: 10,
				refillRate: 0,
				refillIntervalMs: 60000,
				keyResolver: "ip",
			});
			expect(normalized.store).toBe("memory");
			expect(normalized.failureMode).toBe("fail-closed");
			expect(normalized.headers).toEqual({
				standard: true,
				legacy: false,
				retryAfter: true,
			});
			expect(normalized.redisTimeoutMs).toBe(250);
			expect(normalized.redisRetries).toBe(1);
			expect(normalized.redisRetryDelayMs).toBe(25);
			expect(normalized.redisFailureThreshold).toBe(5);
			expect(normalized.redisCooldownMs).toBe(10000);
		});

		it("should throw when policies array is explicitly empty", () => {
			expect(() => normalizeConfig({ policies: [] })).toThrow(
				RateLimitConfigError,
			);
		});

		it("should normalize token-bucket policy correctly", () => {
			const options: RateLimitOptions = {
				policies: [
					{
						name: "bucket-policy",
						algorithm: "token-bucket",
						capacity: 50,
						refillRate: 5,
						refillInterval: "2s",
						key: "user",
					},
				],
			};

			const normalized = normalizeConfig(options);
			const policy = normalized.policies[0];

			expect(policy.name).toBe("bucket-policy");
			expect(policy.algorithm).toBe("token-bucket");
			expect(policy.limit).toBe(50);
			expect(policy.capacity).toBe(50);
			expect(policy.refillRate).toBe(5);
			expect(policy.refillIntervalMs).toBe(2000);
			expect(policy.keyResolver).toBe("user");
		});

		it("should use limit as capacity and window as refillInterval for token-bucket fallbacks", () => {
			const options: RateLimitOptions = {
				policies: [
					{
						algorithm: "token-bucket",
						limit: 20,
						window: "5s",
					},
				],
			};

			const normalized = normalizeConfig(options);
			const policy = normalized.policies[0];

			expect(policy.capacity).toBe(20);
			expect(policy.refillIntervalMs).toBe(5000);
			expect(policy.refillRate).toBe(1);
		});

		it("should throw RateLimitConfigError if token-bucket lacks valid capacity/limit", () => {
			expect(() =>
				normalizeConfig({
					policies: [{ algorithm: "token-bucket", capacity: 0 }],
				}),
			).toThrow(RateLimitConfigError);
		});

		it("should throw RateLimitConfigError if non-token-bucket policy lacks positive limit", () => {
			expect(() =>
				normalizeConfig({
					policies: [{ algorithm: "fixed-window", limit: 0 }],
				}),
			).toThrow(RateLimitConfigError);
		});

		it("should accept custom valid numbers and handle non-positive integer fallbacks for Redis settings", () => {
			const options: RateLimitOptions = {
				limit: 100,
				redisTimeoutMs: 500,
				redisRetries: 3,
				redisRetryDelayMs: 50,
				redisFailureThreshold: 10,
				redisCooldownMs: 30000,
				headers: { legacy: true, standard: false },
				failureMode: "fail-open",
			};

			const normalized = normalizeConfig(options);

			expect(normalized.redisTimeoutMs).toBe(500);
			expect(normalized.redisRetries).toBe(3);
			expect(normalized.redisRetryDelayMs).toBe(50);
			expect(normalized.redisFailureThreshold).toBe(10);
			expect(normalized.redisCooldownMs).toBe(30000);
			expect(normalized.headers.legacy).toBe(true);
			expect(normalized.headers.standard).toBe(false);
			expect(normalized.failureMode).toBe("fail-open");
		});

		it("should fallback to defaults when redis numbers are invalid/negative", () => {
			const options: RateLimitOptions = {
				limit: 100,
				redisTimeoutMs: -10,
				redisRetries: -5,
				redisRetryDelayMs: NaN,
				redisFailureThreshold: 0,
				redisCooldownMs: -100,
			};

			const normalized = normalizeConfig(options);

			expect(normalized.redisTimeoutMs).toBe(250);
			expect(normalized.redisRetries).toBe(1);
			expect(normalized.redisRetryDelayMs).toBe(25);
			expect(normalized.redisFailureThreshold).toBe(5);
			expect(normalized.redisCooldownMs).toBe(10000);
		});
	});
});
