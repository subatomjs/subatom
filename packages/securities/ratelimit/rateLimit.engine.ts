import type { IRequest } from "../../core/http/request/types/request.types.js";
import { resolveKey } from "./resolveKey.js";
import { MemoryStore } from "./stores/MemoryStore.js";
import { RedisStore } from "./stores/RedisStore.js";
import type {
	NormalizedConfig,
	RateLimitResult,
	RateLimitStore,
} from "./types/rateLimit.types.js";

export class RateLimitEngine {
	private store: RateLimitStore;

	constructor(private config: NormalizedConfig) {
		if (typeof config.store === "string") {
			if (config.store === "redis") {
				if (!config.redisClient) {
					throw new Error("RedisStore requires a valid redisClient instance.");
				}
				this.store = new RedisStore(config.redisClient);
			} else {
				this.store = new MemoryStore();
			}
		} else {
			this.store = config.store;
		}
	}

	async processRequest(req: IRequest): Promise<RateLimitResult> {
		const now = Date.now();
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
