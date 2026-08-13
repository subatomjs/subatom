// src/rate-limit/stores/rate-limit.store.ts
export interface StoreEvalParams {
  key: string;
  algorithm: "fixed-window" | "sliding-window" | "token-bucket";
  limit: number;
  windowMs: number;
  capacity: number;
  refillRate: number;
  refillIntervalMs: number;
  now: number;
}

export interface RateLimitStore {
  evaluate(
    params: StoreEvalParams,
  ): Promise<{ allowed: boolean; remaining: number; resetMs: number }>;
  close?(): Promise<void>;
}
