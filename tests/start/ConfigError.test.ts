import { describe, it, expect } from "vitest";
import { ConfigError } from "../../config/ConfigError.js";

describe("ConfigError", () => {
	it("should create error with truncated received value if string exceeds 50 characters", () => {
		const longString = "a".repeat(55);
		const err = new ConfigError("port", "number", longString);

		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("ConfigError");
		expect(err.message).toContain("[REDACTED OR TRUNCATED]");
	});

	it("should create error with string representation of received value if 50 characters or fewer", () => {
		const err = new ConfigError("port", "number", 12345);
		expect(err.name).toBe("ConfigError");
		expect(err.message).toBe(
			'[Subatom Config Error]: Invalid value for "port". Expected number, received: 12345',
		);
	});
});
