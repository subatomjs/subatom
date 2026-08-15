// src/rate-limit/stores/redis.store.ts
import type { RateLimitStore, StoreEvalParams } from "./rateLimit.store.js";

export class RedisStore implements RateLimitStore {
	private client: any;

	constructor(client: any) {
		this.client = client;
	}

	async evaluate(p: StoreEvalParams) {
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
			const res = await this.client.eval(lua, 1, key, p.limit, p.windowMs);
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
          redis.call("ZADD", KEYS[1], now, now)
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
			const res = await this.client.eval(
				lua,
				1,
				key,
				p.now,
				p.windowMs,
				p.limit,
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
		const res = await this.client.eval(
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
}
