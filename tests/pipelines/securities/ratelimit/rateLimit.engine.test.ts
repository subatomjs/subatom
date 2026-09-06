import { describe, expect, it, vi } from "vitest";
import { RateLimitEngine } from "../../../../packages/pipelines/securities/ratelimit/rateLimit.engine.js";
import { MemoryStore } from "../../../../packages/pipelines/securities/ratelimit/stores/MemoryStore.js";
import { RedisStore } from "../../../../packages/pipelines/securities/ratelimit/stores/RedisStore.js";
import type {
	NormalizedConfig,
	RateLimitStore,
} from "../../../../packages/pipelines/securities/ratelimit/types/rateLimit.types.js";
import type { IRequest } from "../../../../packages/core/http/request/types/request.types.js";

describe("RateLimitEngine", () => {
	const mockReq = {
		ip: "127.0.0.1",
		headers: {},
		raw: { socket: { remoteAddress: "127.0.0.1" } },
	} as unknown as IRequest;

	it("should initialize with MemoryStore by default when store is 'memory'", () => {
		const config: NormalizedConfig = {
			policies: [],
			store: "memory",
			redisTimeoutMs: 250,
			redisRetries: 1,
			redisRetryDelayMs: 25,
			redisFailureThreshold: 5,
			redisCooldownMs: 10000,
			headers: { standard: true, legacy: false, retryAfter: true },
			failureMode: "fail-closed",
		};

		const engine = new RateLimitEngine(config);
		expect(
			(engine as unknown as { store: RateLimitStore }).store,
		).toBeInstanceOf(MemoryStore);
	});

	it("should initialize with RedisStore when store is 'redis' and redisClient is provided", () => {
		const config: NormalizedConfig = {
			policies: [],
			store: "redis",
			redisClient: { eval: vi.fn() },
			redisTimeoutMs: 250,
			redisRetries: 1,
			redisRetryDelayMs: 25,
			redisFailureThreshold: 5,
			redisCooldownMs: 10000,
			headers: { standard: true, legacy: false, retryAfter: true },
			failureMode: "fail-closed",
		};

		const engine = new RateLimitEngine(config);
		expect(
			(engine as unknown as { store: RateLimitStore }).store,
		).toBeInstanceOf(RedisStore);
	});

	it("should throw an error if store is 'redis' but redisClient is missing", () => {
		const config: NormalizedConfig = {
			policies: [],
			store: "redis",
			redisClient: undefined,
			redisTimeoutMs: 250,
			redisRetries: 1,
			redisRetryDelayMs: 25,
			redisFailureThreshold: 5,
			redisCooldownMs: 10000,
			headers: { standard: true, legacy: false, retryAfter: true },
			failureMode: "fail-closed",
		};

		expect(() => new RateLimitEngine(config)).toThrow(
			"RedisStore requires a valid redisClient instance.",
		);
	});

	it("should accept a custom RateLimitStore instance directly", () => {
		const customStore: RateLimitStore = {
			evaluate: vi.fn(),
		};

		const config: NormalizedConfig = {
			policies: [],
			store: customStore,
			redisTimeoutMs: 250,
			redisRetries: 1,
			redisRetryDelayMs: 25,
			redisFailureThreshold: 5,
			redisCooldownMs: 10000,
			headers: { standard: true, legacy: false, retryAfter: true },
			failureMode: "fail-closed",
		};

		const engine = new RateLimitEngine(config);
		expect((engine as unknown as { store: RateLimitStore }).store).toBe(
			customStore,
		);
	});

	it("should evaluate multiple policies and return the strictest decision", async () => {
		const mockStore: RateLimitStore = {
			evaluate: vi
				.fn()
				// Policy 1 evaluation: remaining 5
				.mockResolvedValueOnce({ allowed: true, remaining: 5, resetMs: 1000 })
				// Policy 2 evaluation: remaining 1 (strictest)
				.mockResolvedValueOnce({ allowed: true, remaining: 1, resetMs: 2000 }),
		};

		const config: NormalizedConfig = {
			policies: [
				{
					name: "pol-1",
					algorithm: "fixed-window",
					limit: 10,
					windowMs: 1000,
					capacity: 10,
					refillRate: 0,
					refillIntervalMs: 1000,
					keyResolver: "ip",
				},
				{
					name: "pol-2",
					algorithm: "fixed-window",
					limit: 5,
					windowMs: 2000,
					capacity: 5,
					refillRate: 0,
					refillIntervalMs: 2000,
					keyResolver: "ip",
				},
			],
			store: mockStore,
			redisTimeoutMs: 250,
			redisRetries: 1,
			redisRetryDelayMs: 25,
			redisFailureThreshold: 5,
			redisCooldownMs: 10000,
			headers: { standard: true, legacy: false, retryAfter: true },
			failureMode: "fail-closed",
		};

		const engine = new RateLimitEngine(config);
		const result = await engine.processRequest(mockReq);

		expect(result.policyName).toBe("pol-2");
		expect(result.remaining).toBe(1);
	});

	it("should return default decision object if policies array is empty", async () => {
		const config: NormalizedConfig = {
			policies: [],
			store: "memory",
			redisTimeoutMs: 250,
			redisRetries: 1,
			redisRetryDelayMs: 25,
			redisFailureThreshold: 5,
			redisCooldownMs: 10000,
			headers: { standard: true, legacy: false, retryAfter: true },
			failureMode: "fail-closed",
		};

		const engine = new RateLimitEngine(config);
		const result = await engine.processRequest(mockReq);

		expect(result).toEqual({
			allowed: true,
			limit: 0,
			remaining: 0,
			resetMs: 0,
			policyName: "default",
		});
	});

	it("should invoke store.close and store.destroy when closed or destroyed", async () => {
		const mockStore: RateLimitStore = {
			evaluate: vi.fn(),
			close: vi.fn(),
			destroy: vi.fn(),
		};

		const config: NormalizedConfig = {
			policies: [],
			store: mockStore,
			redisTimeoutMs: 250,
			redisRetries: 1,
			redisRetryDelayMs: 25,
			redisFailureThreshold: 5,
			redisCooldownMs: 10000,
			headers: { standard: true, legacy: false, retryAfter: true },
			failureMode: "fail-closed",
		};

		const engine = new RateLimitEngine(config);
		await engine.close();
		expect(mockStore.close).toHaveBeenCalledTimes(1);

		await engine.destroy();
		expect(mockStore.destroy).toHaveBeenCalledTimes(1);
	});
});
