import { describe, it, expect } from "vitest";
import { rateLimit, MemoryStore, RedisStore } from "../../../../../package/core/securities/rate-limits/index.js";

describe("Public API Entry Point (index.ts)", () => {
    it("should export rateLimit factory function", () => {
        expect(typeof rateLimit).toBe("function");
        const middleware = rateLimit({ limit: 10, window: "1m" });
        expect(typeof middleware).toBe("function");
    });

    it("should export MemoryStore and RedisStore classes", () => {
        expect(MemoryStore).toBeDefined();
        expect(RedisStore).toBeDefined();

        const mem = new MemoryStore();
        expect(mem.evaluate).toBeDefined();
        mem.close();
    });
});