import { describe, expect, it } from "vitest";
import { ConfigError } from "../../config/ConfigError.js";

describe("ConfigError", () => {
	it("should construct error message with un-truncated string when length is 50 or less", () => {
		const shortString = "a".repeat(50);
		const error = new ConfigError("testKey", "string", shortString);

		expect(error.name).toBe("ConfigError");
		expect(error.message).toBe(
			`[Subatom Config Error]: Invalid value for "testKey". Expected string, received: ${shortString}`,
		);
		expect(error).toBeInstanceOf(Error);
	});

	it("should redact or truncate string when length is greater than 50", () => {
		const longString = "a".repeat(51);
		const error = new ConfigError("secretKey", "string", longString);

		expect(error.message).toBe(
			'[Subatom Config Error]: Invalid value for "secretKey". Expected string, received: [REDACTED OR TRUNCATED]',
		);
	});

	it("should format non-string values correctly using String() conversion", () => {
		const numError = new ConfigError("port", "number", 99999);
		expect(numError.message).toContain("received: 99999");

		const nullError = new ConfigError("db", "object", null);
		expect(nullError.message).toContain("received: null");

		const undefinedError = new ConfigError("host", "string", undefined);
		expect(undefinedError.message).toContain("received: undefined");

		const objError = new ConfigError("entry", "string", { foo: "bar" });
		expect(objError.message).toContain("received: [object Object]");
	});
});