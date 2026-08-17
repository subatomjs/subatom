// tests/unit/subordinate/services/rateLimitConfig.service.test.ts
import { describe, expect, it, vi } from "vitest";
import * as factoryHelper from "../../../../package/core/bootstrap/subatom/helpers/createRateLimitMiddleware.js";
import * as parserHelper from "../../../../package/core/bootstrap/subatom/helpers/parseRateLimitSpec.js";
import { configureRateLimit } from "../../../../package/core/bootstrap/subatom/subordinate/services/rateLimitConfig.service.js";
import type { MiddlewareHandler } from "../../../../package/types/http/IMiddleware.js";

describe("rateLimitConfig.service - configureRateLimit", () => {
	it("should parse spec and generate middleware handler", () => {
		const dummyMiddleware: MiddlewareHandler = vi.fn();
		const parseSpy = vi
			.spyOn(parserHelper, "parseRateLimitSpec")
			.mockReturnValue({} as any);
		const createSpy = vi
			.spyOn(factoryHelper, "createRateLimitMiddleware")
			.mockReturnValue(dummyMiddleware);

		const result = configureRateLimit("100/15m");

		expect(parseSpy).toHaveBeenCalledWith("100/15m");
		expect(createSpy).toHaveBeenCalledWith("100/15m");
		expect(result).toEqual({
			spec: "100/15m",
			middleware: dummyMiddleware,
		});

		parseSpy.mockRestore();
		createSpy.mockRestore();
	});

	it("should propagate errors thrown by parseRateLimitSpec", () => {
		vi.spyOn(parserHelper, "parseRateLimitSpec").mockImplementation(() => {
			throw new Error("Invalid rate limit spec format");
		});

		expect(() => configureRateLimit("invalid-spec")).toThrow(
			"Invalid rate limit spec format",
		);

		vi.restoreAllMocks();
	});
});
