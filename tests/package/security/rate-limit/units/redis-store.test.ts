import { describe, it, expect, vi, beforeEach } from "vitest";
import { RedisStore } from "../../../../../package/core/securities/rate-limits/stores/redis.store.js";
import type { StoreEvalParams } from "../../../../../package/core/securities/rate-limits/stores/rateLimit.store.js";

describe("RedisStore", () => {
  let mockClient: { eval: ReturnType<typeof vi.fn> };
  let store: RedisStore;

  beforeEach(() => {
    mockClient = {
      eval: vi.fn(),
    };
    store = new RedisStore(mockClient);
  });

  describe("Fixed Window (Lua evaluation)", () => {
    it("should parse allowed and TTL responses correctly", async () => {
      mockClient.eval.mockResolvedValueOnce([1, 50000]);

      const params: StoreEvalParams = {
        key: "tenant1",
        algorithm: "fixed-window",
        limit: 10,
        windowMs: 60000,
        capacity: 10,
        refillRate: 0,
        refillIntervalMs: 60000,
        now: Date.now(),
      };

      const res = await store.evaluate(params);
      expect(mockClient.eval).toHaveBeenCalledWith(
        expect.stringContaining("INCR"),
        1,
        "rl:tenant1",
        10,
        60000,
      );
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(9);
      expect(res.resetMs).toBe(50000);
    });

    it("should handle expired TTL fallback and blocked limit", async () => {
      mockClient.eval.mockResolvedValueOnce([11, -1]);

      const params: StoreEvalParams = {
        key: "tenant1",
        algorithm: "fixed-window",
        limit: 10,
        windowMs: 60000,
        capacity: 10,
        refillRate: 0,
        refillIntervalMs: 60000,
        now: Date.now(),
      };

      const res = await store.evaluate(params);
      expect(res.allowed).toBe(false);
      expect(res.remaining).toBe(0);
      expect(res.resetMs).toBe(60000);
    });
  });

  describe("Sliding Window (Lua evaluation)", () => {
    it("should parse sliding window success result", async () => {
      mockClient.eval.mockResolvedValueOnce([1, 4, 8500]);

      const params: StoreEvalParams = {
        key: "user_api",
        algorithm: "sliding-window",
        limit: 5,
        windowMs: 10000,
        capacity: 5,
        refillRate: 0,
        refillIntervalMs: 10000,
        now: 100000,
      };

      const res = await store.evaluate(params);
      expect(mockClient.eval).toHaveBeenCalledWith(
        expect.stringContaining("ZREMRANGEBYSCORE"),
        1,
        "rl:user_api",
        100000,
        10000,
        5,
      );
      expect(res).toEqual({
        allowed: true,
        remaining: 4,
        resetMs: 8500,
      });
    });

    it("should handle sliding window limit breach", async () => {
      mockClient.eval.mockResolvedValueOnce([0, -1, 4000]);

      const params: StoreEvalParams = {
        key: "user_api",
        algorithm: "sliding-window",
        limit: 5,
        windowMs: 10000,
        capacity: 5,
        refillRate: 0,
        refillIntervalMs: 10000,
        now: 100000,
      };

      const res = await store.evaluate(params);
      expect(res.allowed).toBe(false);
      expect(res.remaining).toBe(0); // Math.max(0, -1)
      expect(res.resetMs).toBe(4000);
    });
  });

  describe("Token Bucket (Lua evaluation)", () => {
    it("should parse token bucket evaluation result", async () => {
      mockClient.eval.mockResolvedValueOnce([1, 8, 1000]);

      const params: StoreEvalParams = {
        key: "tb_key",
        algorithm: "token-bucket",
        limit: 10,
        windowMs: 1000,
        capacity: 10,
        refillRate: 2,
        refillIntervalMs: 1000,
        now: 50000,
      };

      const res = await store.evaluate(params);
      expect(mockClient.eval).toHaveBeenCalledWith(
        expect.stringContaining("HMGET"),
        1,
        "rl:tb_key",
        10,
        2,
        1000,
        50000,
      );
      expect(res).toEqual({
        allowed: true,
        remaining: 8,
        resetMs: 1000,
      });
    });
  });
});
