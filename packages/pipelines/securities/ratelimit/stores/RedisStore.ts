/**
 * @fileoverview Implements Redis-backed rate limiting with atomic Lua scripts
 * for fixed-window, sliding-window, and token-bucket algorithms.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { randomUUID } from "node:crypto";
import type {
	RateLimitStore,
	RedisClientLike,
	RedisStoreOptions,
	StoreEvalParams,
	StoreEvalResult,
} from "../types/rateLimit.types.js";

export class RedisStore implements RateLimitStore {
	private readonly client: RedisClientLike;
	private readonly timeoutMs: number;
	private readonly retries: number;
	private readonly retryDelayMs: number;
	private readonly failureThreshold: number;
	private readonly cooldownMs: number;
	private consecutiveFailures = 0;
	private openedAt = 0;
	private halfOpenInFlight = false;
	private closed = false;

	constructor(client: RedisClientLike, options: RedisStoreOptions = {}) {
		this.client = client;
		this.timeoutMs = positiveInteger(options.timeoutMs, 250);
		this.retries = nonNegativeInteger(options.retries, 1);
		this.retryDelayMs = nonNegativeInteger(options.retryDelayMs, 25);
		this.failureThreshold = positiveInteger(options.failureThreshold, 5);
		this.cooldownMs = positiveInteger(options.cooldownMs, 10_000);
	}

	async evaluate(p: StoreEvalParams): Promise<StoreEvalResult> {
		if (this.closed) throw new Error("RedisStore is closed.");
		const key = `rl:${p.key}`;

		if (p.algorithm === "fixed-window") {
			const lua = `
        local current = redis.call("INCR", KEYS[1])
        if current == 1 then
          redis.call("PEXPIRE", KEYS[1], ARGV[2])
        end
        local ttl = redis.call("PTTL", KEYS[1])
        return { current, ttl }
      `;
			const res = await this.call<[number | string, number | string]>(
				lua,
				1,
				key,
				p.limit,
				p.windowMs,
			);

			const count = Number(res[0]);
			const ttl = Number(res[1]);
			return {
				allowed: count <= p.limit,
				remaining: Math.max(0, p.limit - count),
				resetMs: ttl > 0 ? ttl : p.windowMs,
			};
		}

		if (p.algorithm === "sliding-window") {
			const lua = `
        local now = tonumber(ARGV[1])
        local window = tonumber(ARGV[2])
        local limit = tonumber(ARGV[3])
        local clearBefore = now - window

        redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", clearBefore)
        local count = redis.call("ZCARD", KEYS[1])

        local allowed = 0
        if count < limit then
					redis.call("ZADD", KEYS[1], now, ARGV[4])
          allowed = 1
          count = count + 1
        end

        redis.call("PEXPIRE", KEYS[1], window)
        local oldest = redis.call("ZRANGE", KEYS[1], 0, 0, "WITHSCORES")
        local resetMs = window
        if #oldest > 0 then
          resetMs = (tonumber(oldest[2]) + window) - now
        end

        return { allowed, limit - count, resetMs }
      `;
			const member = `${p.now}-${randomUUID()}`;
			const res = await this.call<[number, number | string, number | string]>(
				lua,
				1,
				key,
				p.now,
				p.windowMs,
				p.limit,
				member,
			);

			return {
				allowed: res[0] === 1,
				remaining: Math.max(0, Number(res[1])),
				resetMs: Math.max(0, Number(res[2])),
			};
		}

		// Token Bucket LUA
		const lua = `
      local capacity = tonumber(ARGV[1])
      local refillRate = tonumber(ARGV[2])
      local refillInterval = tonumber(ARGV[3])
      local now = tonumber(ARGV[4])

      local data = redis.call("HMGET", KEYS[1], "tokens", "lastRefill")
      local tokens = tonumber(data[1])
      local lastRefill = tonumber(data[2])

      if not tokens then
        tokens = capacity
        lastRefill = now
      else
        local elapsed = now - lastRefill
        local refilled = math.floor(elapsed / refillInterval) * refillRate
        if refilled > 0 then
          tokens = math.min(capacity, tokens + refilled)
          lastRefill = now
        end
      end

      local allowed = 0
      if tokens >= 1 then
        tokens = tokens - 1
        allowed = 1
      end

      redis.call("HMSET", KEYS[1], "tokens", tokens, "lastRefill", lastRefill)
      redis.call("PEXPIRE", KEYS[1], refillInterval * 2)

      return { allowed, tokens, refillInterval }
    `;
		const res = await this.call<[number, number | string, number | string]>(
			lua,
			1,
			key,
			p.capacity,
			p.refillRate,
			p.refillIntervalMs,
			p.now,
		);

		return {
			allowed: res[0] === 1,
			remaining: Math.max(0, Number(res[1])),
			resetMs: Number(res[2]),
		};
	}

	async close(): Promise<void> {
		this.closed = true;
	}

	async destroy(): Promise<void> {
		await this.close();
	}

	private async call<T>(
		script: string,
		numKeys: number,
		...args: (string | number)[]
	): Promise<T> {
		const now = Date.now();
		if (this.openedAt > 0) {
			if (now - this.openedAt < this.cooldownMs || this.halfOpenInFlight) {
				throw new Error("Redis rate-limit circuit is open.");
			}
			this.halfOpenInFlight = true;
		}

		let lastError: Error | undefined;
		try {
			for (let attempt = 0; attempt <= this.retries; attempt += 1) {
				try {
					const result = await this.callOnce<T>(script, numKeys, ...args);
					this.consecutiveFailures = 0;
					this.openedAt = 0;
					return result;
				} catch (error) {
					lastError = error instanceof Error ? error : new Error(String(error));
					if (attempt < this.retries && this.retryDelayMs > 0) {
						await this.delay(this.retryDelayMs);
					}
				}
			}

			throw lastError ?? new Error("Redis rate-limit call failed.");
		} catch (error) {
			this.consecutiveFailures += 1;
			if (this.consecutiveFailures >= this.failureThreshold) {
				this.openedAt = Date.now();
				console.warn(
					"[Subatom RateLimit] Redis circuit opened after repeated failures.",
				);
			}
			throw error instanceof Error ? error : new Error(String(error));
		} finally {
			this.halfOpenInFlight = false;
		}
	}

	private async callOnce<T>(
		script: string,
		numKeys: number,
		...args: (string | number)[]
	): Promise<T> {
		let timer: NodeJS.Timeout | undefined;
		try {
			return await Promise.race([
				this.client.eval(script, numKeys, ...args) as Promise<T>,
				new Promise<T>((_, reject) => {
					timer = setTimeout(
						() => reject(new Error("Redis rate-limit call timed out.")),
						this.timeoutMs,
					);
				}),
			]);
		} finally {
			if (timer) clearTimeout(timer);
		}
	}

	private delay(delayMs: number): Promise<void> {
		return new Promise((resolve) => {
			const timer = setTimeout(resolve, delayMs);
			timer.unref();
		});
	}
}

function positiveInteger(value: number | undefined, fallback: number): number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0
		? value
		: fallback;
}

function nonNegativeInteger(
	value: number | undefined,
	fallback: number,
): number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
		? value
		: fallback;
}
