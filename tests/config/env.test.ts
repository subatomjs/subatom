/// <reference types="node" />
import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configEnv, env } from "../../config/env/env.js";

vi.mock("node:fs");

describe("env and configEnv", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		vi.resetAllMocks();
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.restoreAllMocks();
	});

	describe("configEnv", () => {
		it("should return empty object if file does not exist in non-strict mode", () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);

			const result = configEnv({ path: ".env.missing", strict: false });
			expect(result).toEqual({});
		});

		it("should throw error if file does not exist in strict mode", () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);

			expect(() => configEnv({ path: ".env.missing", strict: true })).toThrow(
				/Env file not found at/,
			);
		});

		it("should read, parse, and load variables into process.env without overriding existing keys by default", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue("APP_NAME=Subatom\nPORT=4000");

			process.env.PORT = "3000";

			const parsed = configEnv({ path: ".env.test" });

			expect(parsed).toEqual({ APP_NAME: "Subatom", PORT: "4000" });
			expect(process.env.APP_NAME).toBe("Subatom");
			expect(process.env.PORT).toBe("3000");
			expect(env.isLoaded).toBe(true);
		});

		it("should override existing process.env variables when override option is true", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue("PORT=5000");

			process.env.PORT = "3000";

			configEnv({ override: true });
			expect(process.env.PORT).toBe("5000");
		});

		it("should catch read errors, warn to console, and return empty object in non-strict mode", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation(() => {
				throw new Error("Disk EACCES");
			});

			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			const result = configEnv({ strict: false });
			expect(result).toEqual({});
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					"[Subatom Env Warning]: Failed to load env file",
				),
			);
		});

		it("should throw custom formatted error when read fails in strict mode", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation(() => {
				throw new Error("Disk EACCES");
			});

			expect(() => configEnv({ strict: true })).toThrow(
				/\[Subatom Env Error\]: Failed to load .* Disk EACCES/,
			);
		});

		it("should format non-Error filesystem failures in non-strict mode", () => {
			// Arrange
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockImplementation(() => {
				throw "filesystem unavailable";
			});
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			// Act
			const result = configEnv({ strict: false });

			// Assert
			expect(result).toEqual({});
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining("filesystem unavailable"),
			);
		});
	});

	describe("env accessors", () => {
		it("should inspect NODE_ENV and corresponding booleans correctly", () => {
			process.env.NODE_ENV = "development";
			expect(env.NODE_ENV).toBe("development");
			expect(env.isDev).toBe(true);
			expect(env.isProd).toBe(false);
			expect(env.isTest).toBe(false);

			process.env.NODE_ENV = "production";
			expect(env.isDev).toBe(false);
			expect(env.isProd).toBe(true);
			expect(env.isTest).toBe(false);

			process.env.NODE_ENV = "test";
			expect(env.isDev).toBe(false);
			expect(env.isProd).toBe(false);
			expect(env.isTest).toBe(true);

			delete process.env.NODE_ENV;
			expect(env.NODE_ENV).toBe("development");
		});

		it("should get string values and return default when variable is absent", () => {
			process.env.TEST_KEY = "testValue";
			expect(env.get("TEST_KEY")).toBe("testValue");
			expect(env.get("NON_EXISTENT", "fallback")).toBe("fallback");
			expect(env.get("NON_EXISTENT")).toBe("");
		});

		it("should use defaults only for undefined values while retaining empty and whitespace strings", () => {
			// Arrange
			delete process.env.COVERAGE_UNSET;
			process.env.COVERAGE_EMPTY = "";
			process.env.COVERAGE_WHITESPACE = "   ";

			// Act
			const unsetWithFallback = env.get("COVERAGE_UNSET", "custom-fallback");
			const unsetWithoutFallback = env.get("COVERAGE_UNSET");
			const emptyWithFallback = env.get("COVERAGE_EMPTY", "custom-fallback");
			const whitespaceWithFallback = env.get(
				"COVERAGE_WHITESPACE",
				"custom-fallback",
			);

			// Assert
			expect(unsetWithFallback).toBe("custom-fallback");
			expect(unsetWithoutFallback).toBe("");
			expect(emptyWithFallback).toBe("");
			expect(whitespaceWithFallback).toBe("   ");
		});

		it("should treat an empty NODE_ENV as development but preserve whitespace", () => {
			// Arrange
			process.env.NODE_ENV = "";

			// Act
			const emptyEnvironment = env.NODE_ENV;
			process.env.NODE_ENV = " ";
			const whitespaceEnvironment = env.NODE_ENV;

			// Assert
			expect(emptyEnvironment).toBe("development");
			expect(whitespaceEnvironment).toBe(" ");
		});

		it("should getRequired variables or throw when missing or empty", () => {
			process.env.VALID = "value";
			process.env.EMPTY = "";

			expect(env.getRequired("VALID")).toBe("value");
			expect(() => env.getRequired("EMPTY")).toThrow(
				'[Subatom Env Error]: Missing required environment variable "EMPTY"',
			);
			expect(() => env.getRequired("UNSET")).toThrow(
				'[Subatom Env Error]: Missing required environment variable "UNSET"',
			);
		});

		it("should getNumber with valid values and defaults, and throw on invalid or missing values", () => {
			process.env.PORT = "8080";
			process.env.EMPTY = "";
			process.env.INVALID = "abc";

			expect(env.getNumber("PORT")).toBe(8080);
			expect(env.getNumber("UNSET", 3000)).toBe(3000);
			expect(env.getNumber("EMPTY", 3000)).toBe(3000);

			expect(() => env.getNumber("UNSET")).toThrow(
				'[Subatom Env Error]: Missing numeric environment variable "UNSET"',
			);
			expect(() => env.getNumber("INVALID")).toThrow(
				'[Subatom Env Error]: Environment variable "INVALID" is not a valid number: "abc"',
			);
		});

		it("should parse boolean values across truthy and falsy expressions", () => {
			const truthy = ["true", "1", "yes", "on", "TRUE", " YES "];
			for (const val of truthy) {
				process.env.FLAG = val;
				expect(env.getBoolean("FLAG")).toBe(true);
			}

			const falsy = ["false", "0", "no", "off", "random"];
			for (const val of falsy) {
				process.env.FLAG = val;
				expect(env.getBoolean("FLAG")).toBe(false);
			}

			delete process.env.FLAG;
			expect(env.getBoolean("FLAG", true)).toBe(true);
			expect(env.getBoolean("FLAG", false)).toBe(false);
		});

		it("should test for variable presence using has()", () => {
			process.env.SET = "1";
			process.env.BLANK = "";
			delete process.env.UNSET;

			expect(env.has("SET")).toBe(true);
			expect(env.has("BLANK")).toBe(false);
			expect(env.has("UNSET")).toBe(false);
		});

		it("should return frozen record from getAll() containing loaded file variables", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.readFileSync).mockReturnValue("KEY_A=Alpha\nKEY_B=Beta");

			configEnv({ path: ".env" });

			const all = env.getAll();
			expect(all).toEqual({ KEY_A: "Alpha", KEY_B: "Beta" });
			expect(Object.isFrozen(all)).toBe(true);
		});
	});
});
