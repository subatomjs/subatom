import { describe, it, expect } from "vitest";
import {
  parseDuration,
  normalizeConfig,
  type RateLimitOptions,
} from "../../../../../package/core/securities/rate-limits/rateLimit.config.js";
import { RateLimitConfigError } from "../../../../../package/core/securities/rate-limits/errors.js";
import { MemoryStore } from "../../../../../package/core/securities/rate-limits/stores/memory.store.js";

describe("RateLimit Config - parseDuration", () => {
  it("should return raw numbers directly as milliseconds", () => {
    expect(parseDuration(5000)).toBe(5000);
    expect(parseDuration(0)).toBe(0);
  });

  it("should correctly parse duration units (seconds, minutes, hours, days, ms default)", () => {
    expect(parseDuration("10s")).toBe(10000);
    expect(parseDuration("5m")).toBe(300000);
    expect(parseDuration("2h")).toBe(7200000);
    expect(parseDuration("1d")).toBe(86400000);
    expect(parseDuration("250")).toBe(250);
    expect(parseDuration("  15m  ")).toBe(900000);
  });

  it("should throw RateLimitConfigError on malformed duration strings", () => {
    expect(() => parseDuration("invalid")).toThrow(RateLimitConfigError);
    expect(() => parseDuration("10years")).toThrow(RateLimitConfigError);
    expect(() => parseDuration("-5s")).toThrow(RateLimitConfigError);
    expect(() => parseDuration("")).toThrow(RateLimitConfigError);
  });
});

describe("RateLimit Config - normalizeConfig", () => {
  it("should normalize minimal single-policy options with default sliding-window", () => {
    const options: RateLimitOptions = {
      limit: 100,
      window: "1m",
    };

    const normalized = normalizeConfig(options);
    expect(normalized.store).toBe("memory");
    expect(normalized.failureMode).toBe("fail-open");
    expect(normalized.headers).toEqual({
      standard: true,
      legacy: false,
      retryAfter: true,
    });
    expect(normalized.policies).toHaveLength(1);
    expect(normalized.policies[0]).toEqual({
      name: "policy_0",
      algorithm: "sliding-window",
      limit: 100,
      windowMs: 60000,
      capacity: 100,
      refillRate: 0,
      refillIntervalMs: 60000,
      keyResolver: "ip",
    });
  });

  it("should normalize fixed-window policy correctly", () => {
    const options: RateLimitOptions = {
      name: "fixed_test",
      algorithm: "fixed-window",
      limit: 50,
      window: "30s",
      key: "user",
    };

    const normalized = normalizeConfig(options);
    expect(normalized.policies[0]).toEqual({
      name: "fixed_test",
      algorithm: "fixed-window",
      limit: 50,
      windowMs: 30000,
      capacity: 50,
      refillRate: 0,
      refillIntervalMs: 30000,
      keyResolver: "user",
    });
  });

  it("should normalize token-bucket policy using capacity and refillRate", () => {
    const options: RateLimitOptions = {
      name: "token_test",
      algorithm: "token-bucket",
      capacity: 20,
      refillRate: 5,
      refillInterval: "10s",
    };

    const normalized = normalizeConfig(options);
    expect(normalized.policies[0]).toEqual({
      name: "token_test",
      algorithm: "token-bucket",
      limit: 20,
      windowMs: 10000,
      capacity: 20,
      refillRate: 5,
      refillIntervalMs: 10000,
      keyResolver: "ip",
    });
  });

  it("should normalize token-bucket policy falling back to limit and window", () => {
    const options: RateLimitOptions = {
      algorithm: "token-bucket",
      limit: 15,
      window: "2s",
    };

    const normalized = normalizeConfig(options);
    expect(normalized.policies[0].capacity).toBe(15);
    expect(normalized.policies[0].refillIntervalMs).toBe(2000);
    expect(normalized.policies[0].refillRate).toBe(1);
  });

  it("should normalize multi-policy configuration", () => {
    const options: RateLimitOptions = {
      policies: [
        { name: "per_sec", limit: 10, window: "1s" },
        { name: "per_min", limit: 100, window: "1m" },
      ],
      headers: { legacy: true, retryAfter: false },
      failureMode: "fail-closed",
    };

    const normalized = normalizeConfig(options);
    expect(normalized.policies).toHaveLength(2);
    expect(normalized.policies[0].name).toBe("per_sec");
    expect(normalized.policies[1].name).toBe("per_min");
    expect(normalized.headers.legacy).toBe(true);
    expect(normalized.headers.retryAfter).toBe(false);
    expect(normalized.headers.standard).toBe(true);
    expect(normalized.failureMode).toBe("fail-closed");
  });

  it("should preserve custom store instance and callbacks", () => {
    const customStore = new MemoryStore();
    const onLimitExceeded = () => {};
    const onStoreError = () => {};

    const normalized = normalizeConfig({
      limit: 10,
      store: customStore,
      onLimitExceeded,
      onStoreError,
    });

    expect(normalized.store).toBe(customStore);
    expect(normalized.onLimitExceeded).toBe(onLimitExceeded);
    expect(normalized.onStoreError).toBe(onStoreError);
  });

  it("should throw RateLimitConfigError if empty policy array is provided", () => {
    expect(() => normalizeConfig({ policies: [] })).toThrow(
      RateLimitConfigError,
    );
  });

  it("should throw RateLimitConfigError if non-token-bucket policy is missing positive limit", () => {
    expect(() => normalizeConfig({ limit: 0 })).toThrow(RateLimitConfigError);
    expect(() => normalizeConfig({ limit: -10 })).toThrow(RateLimitConfigError);
    expect(() => normalizeConfig({} as any)).toThrow(RateLimitConfigError);
  });

  it("should throw RateLimitConfigError if token-bucket policy lacks positive capacity/limit", () => {
    expect(() =>
      normalizeConfig({ algorithm: "token-bucket", capacity: 0 }),
    ).toThrow(RateLimitConfigError);
    expect(() =>
      normalizeConfig({ algorithm: "token-bucket", limit: -5 }),
    ).toThrow(RateLimitConfigError);
  });
});
