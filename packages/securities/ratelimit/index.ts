// 1. Export all types
export type {
	AlgorithmType,
	KeyType,
	KeyResolver,
	StoreType,
	FailureMode,
	RedisClientLike,
	StoreEvalParams,
	StoreEvalResult,
	RateLimitStore,
	PolicyConfig,
	HeaderConfig,
	RateLimitOptions,
	RateLimitResult,
	NormalizedPolicy,
	NormalizedConfig,
} from "./types/rateLimit.types.js";

// 2. Export from store
export { MemoryStore as RateLimitMemory } from "./stores/MemoryStore.js";
export * from "./stores/RedisStore.js";

// 3. Export all from root
export * from "./applyHeaders.js";
export * from "./rateLimit.config.js";
export * from "./rateLimit.engine.js";
export * from "./rateLimit.middleware.js";
export * from "./resolveKey.js";
