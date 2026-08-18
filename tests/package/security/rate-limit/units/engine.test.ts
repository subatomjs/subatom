import { describe, it, expect, vi, beforeEach } from "vitest";
import { RateLimitEngine } from "../../../../../package/core/securities/rate-limits/rateLimit.engine.js";
import { normalizeConfig } from "../../../../../package/core/securities/rate-limits/rateLimit.config.js";
import { MemoryStore } from "../../../../../package/core/securities/rate-limits/stores/memory.store.js";
import { RedisStore } from "../../../../../package/core/securities/rate-limits/stores/redis.store.js";

describe("RateLimitEngine", () => {
  it("should instantiate MemoryStore when store option is 'memory'", () => {
    const config = normalizeConfig({ limit: 10, store: "memory" });
    const engine = new RateLimitEngine(config);
    expect((engine as any).store).toBeInstanceOf(MemoryStore);
  });

  it("should instantiate RedisStore when store option is 'redis'", () => {
    const mockRedis = { eval: vi.fn() };
    const config = normalizeConfig({
      limit: 10,
      store: "redis",
      redisClient: mockRedis,
    });
    const engine = new RateLimitEngine(config);
    expect((engine as any).store).toBeInstanceOf(RedisStore);
  });

  it("should process multi-policy evaluation and select the strictest policy remaining count", async () => {
    const config = normalizeConfig({
      policies: [
        { name: "burst", limit: 5, window: "1s" },
        { name: "sustained", limit: 100, window: "1m" },
      ],
    });

    const engine = new RateLimitEngine(config);
    const req = { ip: "192.168.1.1" };

    const result1 = await engine.processRequest(req);
    expect(result1.allowed).toBe(true);
    expect(result1.policyName).toBe("burst");
    expect(result1.remaining).toBe(4);
  });

  it("should block request if any single policy is violated", async () => {
    const config = normalizeConfig({
      policies: [
        { name: "p_strict", limit: 1, window: "1m" },
        { name: "p_relaxed", limit: 100, window: "1m" },
      ],
    });

    const engine = new RateLimitEngine(config);
    const req = { ip: "10.0.0.1" };

    const res1 = await engine.processRequest(req);
    expect(res1.allowed).toBe(true);

    const res2 = await engine.processRequest(req);
    expect(res2.allowed).toBe(false);
    expect(res2.policyName).toBe("p_strict");
    expect(res2.remaining).toBe(0);
  });

  it("should return default metadata when policy list is empty", async () => {
    const engine = new RateLimitEngine({
      policies: [],
      store: new MemoryStore(),
      headers: { standard: true, legacy: false, retryAfter: true },
      failureMode: "fail-open",
    });

    const result = await engine.processRequest({});
    expect(result).toEqual({
      allowed: true,
      limit: 0,
      remaining: 0,
      resetMs: 0,
      policyName: "default",
    });
  });
});
