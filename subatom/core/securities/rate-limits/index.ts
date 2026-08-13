// src/rate-limit/index.ts
import { createRateLimitMiddleware } from "./rateLimit.middleware.js";
import { RateLimitOptions } from "./rateLimit.config.js";

export function rateLimit(options: RateLimitOptions) {
  return createRateLimitMiddleware(options);
}

export type { RateLimitOptions, RateLimitResult } from "./rateLimit.config.js";
export { MemoryStore } from "./stores/memory.store.js";
export { RedisStore } from "./stores/redis.store.js";
