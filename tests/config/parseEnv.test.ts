/** biome-ignore-all lint/suspicious/noTemplateCurlyInString: explanation */
import { describe, expect, it } from "vitest";
import { parseEnv } from "../../config/env/parseEnv.js";

describe("parseEnv", () => {
	it("should return empty object for empty input or comments only", () => {
		expect(parseEnv("")).toEqual({});
		expect(parseEnv("# This is a comment\n# Another comment")).toEqual({});
	});

	it("should parse standard key-value unquoted pairs and ignore trailing comments", () => {
		const env = `
      PORT=8080 # App port
      HOST=127.0.0.1
      DEBUG=true
    `;
		const result = parseEnv(env);
		expect(result).toEqual({
			PORT: "8080",
			HOST: "127.0.0.1",
			DEBUG: "true",
		});
	});

	it("should preserve punctuation in unquoted values and trim trailing comments", () => {
		// Arrange
		const source =
			"DATABASE_URL=postgres://user:pass@example.test:5432/app?sslmode=require\nTOKEN=abc=def== # comment";

		// Act
		const parsed = parseEnv(source);

		// Assert
		expect(parsed).toEqual({
			DATABASE_URL:
				"postgres://user:pass@example.test:5432/app?sslmode=require",
			TOKEN: "abc=def==",
		});
	});

	it("should assign empty values for unquoted and quoted declarations", () => {
		// Arrange
		const source = "UNQUOTED=\nDOUBLE=\"\"\nSINGLE=''\nCOMMENTED= # comment";

		// Act
		const parsed = parseEnv(source);

		// Assert
		expect(parsed).toEqual({
			UNQUOTED: "",
			DOUBLE: "",
			SINGLE: "",
			COMMENTED: "",
		});
	});

	it("should support 'export ' prefix on variable declarations", () => {
		const env = `
      export API_KEY=secret_key
      export NODE_ENV=production
    `;
		expect(parseEnv(env)).toEqual({
			API_KEY: "secret_key",
			NODE_ENV: "production",
		});
	});

	it("should handle single-quoted values with escaped single quotes", () => {
		const env = "GREETING='Hello \\'Subatom\\' Users'";
		expect(parseEnv(env)).toEqual({
			GREETING: "Hello 'Subatom' Users",
		});
	});

	it("should handle double-quoted values with escaped characters and newlines", () => {
		const env = 'MULTILINE="Line 1\\nLine 2\\r\\"Escaped\\""';
		expect(parseEnv(env)).toEqual({
			MULTILINE: 'Line 1\nLine 2\r"Escaped"',
		});
	});

	it("should handle backtick-quoted values and preserve inner quotes", () => {
		const env = "TEMPLATE=`Hello ${name} \\`escaped\\``";
		expect(parseEnv(env)).toEqual({
			TEMPLATE: "Hello ${name} `escaped`",
		});
	});

	it("should normalize Windows CRLF line endings cleanly", () => {
		const env = "A=1\r\nB=2\rC=3\n";
		expect(parseEnv(env)).toEqual({
			A: "1",
			B: "2",
			C: "3",
		});
	});

	it("should reset regex lastIndex and be safely re-invoked concurrently or iteratively", () => {
		const env1 = "FOO=bar";
		const env2 = "BAZ=qux";
		expect(parseEnv(env1)).toEqual({ FOO: "bar" });
		expect(parseEnv(env2)).toEqual({ BAZ: "qux" });
	});
});
