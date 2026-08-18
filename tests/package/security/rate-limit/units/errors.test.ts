import { describe, it, expect } from "vitest";
import {
    RateLimitError,
    RateLimitConfigError,
    RateLimitStoreError,
} from "../../../../../package/core/securities/rate-limits/errors.js";

describe("RateLimit Error Classes", () => {
    it("should instantiate base RateLimitError with correct name and message", () => {
        const error = new RateLimitError("Base error occurred");
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(RateLimitError);
        expect(error.name).toBe("RateLimitError");
        expect(error.message).toBe("Base error occurred");
    });

    it("should instantiate RateLimitConfigError with prefixed message and inheritance", () => {
        const error = new RateLimitConfigError("Invalid option provided");
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(RateLimitError);
        expect(error).toBeInstanceOf(RateLimitConfigError);
        expect(error.message).toBe("[RateLimit Config Error]: Invalid option provided");
    });

    it("should instantiate RateLimitStoreError with prefixed message and inheritance", () => {
        const error = new RateLimitStoreError("Connection to store timed out");
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(RateLimitError);
        expect(error).toBeInstanceOf(RateLimitStoreError);
        expect(error.message).toBe("[RateLimit Store Error]: Connection to store timed out");
    });
});