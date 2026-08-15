// src/rate-limit/rate-limit.engine.ts

import { resolveKey } from "./keys.js";
import type { NormalizedConfig, RateLimitResult } from "./rateLimit.config.js";
import { MemoryStore } from "./stores/memory.store.js";
import type { RateLimitStore } from "./stores/rateLimit.store.js";
import { RedisStore } from "./stores/redis.store.js";

export class RateLimitEngine {
	private store: RateLimitStore;

	constructor(private config: NormalizedConfig) {
		if (typeof config.store === "string") {
			this.store =
				config.store === "redis"
					? new RedisStore(config.redisClient)
					: new MemoryStore();
		} else {
			this.store = config.store;
		}
	}

	async processRequest(req: any): Promise<RateLimitResult> {
		const now = Date.now();
		let overallAllowed = true;
		let strictestMeta: RateLimitResult | null = null;

		for (const policy of this.config.policies) {
			const keySuffix = await resolveKey(req, policy.keyResolver);
			const fullKey = `${policy.name}:${keySuffix}`;

			const res = await this.store.evaluate({
				key: fullKey,
				algorithm: policy.algorithm,
				limit: policy.limit,
				windowMs: policy.windowMs,
				capacity: policy.capacity,
				refillRate: policy.refillRate,
				refillIntervalMs: policy.refillIntervalMs,
				now,
			});

			const currentMeta: RateLimitResult = {
				allowed: res.allowed,
				limit: policy.limit,
				remaining: res.remaining,
				resetMs: res.resetMs,
				policyName: policy.name,
			};

			if (!res.allowed) overallAllowed = false;

			if (!strictestMeta || currentMeta.remaining < strictestMeta.remaining) {
				strictestMeta = currentMeta;
			}
		}

		return (
			strictestMeta || {
				allowed: true,
				limit: 0,
				remaining: 0,
				resetMs: 0,
				policyName: "default",
			}
		);
	}
}
