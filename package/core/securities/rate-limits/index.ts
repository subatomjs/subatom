// src/rate-limit/index.ts

import type { RateLimitOptions } from "./rateLimit.config.js";
import { createRateLimitMiddleware } from "./rateLimit.middleware.js";

export function rateLimit(options: RateLimitOptions) {
	return createRateLimitMiddleware(options);
}

export type { RateLimitOptions, RateLimitResult } from "./rateLimit.config.js";
export { MemoryStore } from "./stores/memory.store.js";
export { RedisStore } from "./stores/redis.store.js";
