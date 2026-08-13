// src/rate-limit/rate-limit.config.ts
import { RateLimitConfigError } from "./errors.js";
import { RateLimitStore } from "./stores/rateLimit.store.js";

export type AlgorithmType = "fixed-window" | "sliding-window" | "token-bucket";
export type KeyType =
  | "ip"
  | "user"
  | "api-key"
  | "tenant"
  | "route"
  | "composite";
export type KeyResolver = KeyType | ((req: any) => string | Promise<string>);
export type StoreType = "memory" | "redis";
export type FailureMode = "fail-open" | "fail-closed";

export interface PolicyConfig {
  name?: string;
  algorithm?: AlgorithmType;
  limit?: number;
  window?: string | number; // e.g., "1m", "15m", "1s", or ms
  capacity?: number;
  refillRate?: number;
  refillInterval?: string | number;
  key?: KeyResolver;
}

export interface HeaderConfig {
  standard?: boolean;
  legacy?: boolean;
  retryAfter?: boolean;
}

export interface RateLimitOptions extends PolicyConfig {
  policies?: PolicyConfig[];
  store?: StoreType | RateLimitStore;
  redisClient?: any;
  headers?: HeaderConfig;
  failureMode?: FailureMode;
  onLimitExceeded?: (req: any, res: any, meta: RateLimitResult) => void;
  onStoreError?: (err: Error, req: any) => void;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetMs: number;
  policyName: string;
}

export interface NormalizedPolicy {
  name: string;
  algorithm: AlgorithmType;
  limit: number;
  windowMs: number;
  capacity: number;
  refillRate: number;
  refillIntervalMs: number;
  keyResolver: KeyResolver;
}

export interface NormalizedConfig {
  policies: NormalizedPolicy[];
  store: StoreType | RateLimitStore;
  redisClient?: any;
  headers: Required<HeaderConfig>;
  failureMode: FailureMode;
  onLimitExceeded?: (req: any, res: any, meta: RateLimitResult) => void;
  onStoreError?: (err: Error, req: any) => void;
}

export function parseDuration(duration: string | number): number {
  if (typeof duration === "number") return duration;
  const match = /^(\d+)(s|m|h|d)?$/.exec(duration.trim());
  if (!match)
    throw new RateLimitConfigError(`Invalid duration format: ${duration}`);
  const val = parseInt(match[1]!, 10);
  const unit = match[2] || "ms";
  switch (unit) {
    case "s":
      return val * 1000;
    case "m":
      return val * 60 * 1000;
    case "h":
      return val * 3600 * 1000;
    case "d":
      return val * 86400 * 1000;
    default:
      return val;
  }
}

export function normalizeConfig(options: RateLimitOptions): NormalizedConfig {
  const policiesConfig = options.policies || [options];
  if (!policiesConfig.length)
    throw new RateLimitConfigError("At least one policy must be provided.");

  const policies: NormalizedPolicy[] = policiesConfig.map((p, idx) => {
    const algorithm = p.algorithm || "sliding-window";
    const name = p.name || `policy_${idx}`;
    const keyResolver = p.key || "ip";

    if (algorithm === "token-bucket") {
      const capacity = p.capacity ?? p.limit;
      if (!capacity || capacity <= 0)
        throw new RateLimitConfigError(
          `Policy ${name}: Token bucket requires positive 'capacity' or 'limit'.`,
        );
      const refillIntervalMs = parseDuration(
        p.refillInterval || p.window || "1s",
      );
      const refillRate = p.refillRate || 1;
      return {
        name,
        algorithm,
        limit: capacity,
        windowMs: refillIntervalMs,
        capacity,
        refillRate,
        refillIntervalMs,
        keyResolver,
      };
    } else {
      const limit = p.limit;
      if (!limit || limit <= 0)
        throw new RateLimitConfigError(
          `Policy ${name}: Requires positive 'limit'.`,
        );
      const windowMs = parseDuration(p.window || "1m");
      return {
        name,
        algorithm,
        limit,
        windowMs,
        capacity: limit,
        refillRate: 0,
        refillIntervalMs: windowMs,
        keyResolver,
      };
    }
  });

  return <any>{
    policies,
    store: options.store || "memory",
    redisClient: options.redisClient,
    headers: {
      standard: options.headers?.standard ?? true,
      legacy: options.headers?.legacy ?? false,
      retryAfter: options.headers?.retryAfter ?? true,
    },
    failureMode: options.failureMode || "fail-open",
    onLimitExceeded: options.onLimitExceeded,
    onStoreError: options.onStoreError,
  };
}
