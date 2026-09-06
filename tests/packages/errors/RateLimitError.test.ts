import { describe, expect, it } from "vitest";
import {
	RateLimitConfigError,
	RateLimitError,
	RateLimitStoreError,
} from "../../../packages/errors/RateLimitError.js";

describe("RateLimit Errors", () => {
	describe("RateLimitError", () => {
		it("should instantiate with correct message, name, and prototype inheritance", () => {
			// Arrange
			const rawMessage = "Rate limit exceeded";

			// Act
			const error = new RateLimitError(rawMessage);

			// Assert
			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(RateLimitError);
			expect(error.name).toBe("RateLimitError");
			expect(error.message).toBe(rawMessage);
			expect(error.stack).toBeDefined();
		});
	});

	describe("RateLimitConfigError", () => {
		it("should instantiate with formatted message and preserve inheritance hierarchy", () => {
			// Arrange
			const detail = "Window must be a positive integer";

			// Act
			const error = new RateLimitConfigError(detail);

			// Assert
			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(RateLimitError);
			expect(error).toBeInstanceOf(RateLimitConfigError);
			expect(error.name).toBe("RateLimitError");
			expect(error.message).toBe(`[RateLimit Config Error]: ${detail}`);
			expect(error.stack).toBeDefined();
		});
	});

	describe("RateLimitStoreError", () => {
		it("should instantiate with formatted message and preserve inheritance hierarchy", () => {
			// Arrange
			const detail = "Redis connection timed out";

			// Act
			const error = new RateLimitStoreError(detail);

			// Assert
			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(RateLimitError);
			expect(error).toBeInstanceOf(RateLimitStoreError);
			expect(error.name).toBe("RateLimitError");
			expect(error.message).toBe(`[RateLimit Store Error]: ${detail}`);
			expect(error.stack).toBeDefined();
		});
	});
});
