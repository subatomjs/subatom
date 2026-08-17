/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EnvError, env } from "../../../package/core/helpers/framework/env.js";

describe("Env Utility", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe("EnvError", () => {
		it("instantiates correctly with proper name and message", () => {
			const error = new EnvError("Custom test error");
			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(EnvError);
			expect(error.name).toBe("EnvError");
			expect(error.message).toBe("Custom test error");
		});
	});

	describe("env()", () => {
		it("returns the environment variable value when set", () => {
			process.env.TEST_VAR = "production_value";
			expect(env("TEST_VAR")).toBe("production_value");
		});

		it("returns undefined when variable is not set and no default provided", () => {
			delete process.env.TEST_VAR;
			expect(env("TEST_VAR")).toBeUndefined();
		});

		it("returns defaultValue when variable is not set", () => {
			delete process.env.TEST_VAR;
			expect(env("TEST_VAR", "default_val")).toBe("default_val");
		});

		it("returns defaultValue when variable is an empty string", () => {
			process.env.TEST_VAR = "";
			expect(env("TEST_VAR", "default_val")).toBe("default_val");
		});
	});

	describe("env.require()", () => {
		it("returns value when variable exists and is non-empty", () => {
			process.env.REQUIRED_VAR = "secret_key";
			expect(env.require("REQUIRED_VAR")).toBe("secret_key");
		});

		it("throws EnvError when variable is undefined", () => {
			delete process.env.REQUIRED_VAR;
			expect(() => env.require("REQUIRED_VAR")).toThrow(EnvError);
			expect(() => env.require("REQUIRED_VAR")).toThrow(
				"Missing required environment variable: REQUIRED_VAR",
			);
		});

		it("throws EnvError when variable is an empty string", () => {
			process.env.REQUIRED_VAR = "";
			expect(() => env.require("REQUIRED_VAR")).toThrow(EnvError);
			expect(() => env.require("REQUIRED_VAR")).toThrow(
				"Missing required environment variable: REQUIRED_VAR",
			);
		});
	});

	describe("env.number()", () => {
		it("parses valid integer and float numbers", () => {
			process.env.PORT = "8080";
			process.env.RATE = "3.1415";
			process.env.ZERO = "0";
			process.env.NEGATIVE = "-42";

			expect(env.number("PORT")).toBe(8080);
			expect(env.number("RATE")).toBe(3.1415);
			expect(env.number("ZERO")).toBe(0);
			expect(env.number("NEGATIVE")).toBe(-42);
		});

		it("returns undefined if not set and no default provided", () => {
			delete process.env.PORT;
			expect(env.number("PORT")).toBeUndefined();
		});

		it("returns defaultValue when variable is unset or empty string", () => {
			delete process.env.PORT;
			expect(env.number("PORT", 3000)).toBe(3000);

			process.env.PORT = "";
			expect(env.number("PORT", 3000)).toBe(3000);
		});

		it("throws EnvError on non-numeric input", () => {
			process.env.PORT = "invalid_number";
			expect(() => env.number("PORT")).toThrow(EnvError);
			expect(() => env.number("PORT")).toThrow(
				'Environment variable "PORT" is not a valid number: "invalid_number"',
			);
		});
	});

	describe("env.bool()", () => {
		it("returns true for all truthy strings (case-insensitive)", () => {
			const truthyValues = ["true", "TRUE", "1", "yes", "YES", "on", "ON"];
			for (const val of truthyValues) {
				process.env.FLAG = val;
				expect(env.bool("FLAG")).toBe(true);
			}
		});

		it("returns false for non-truthy defined strings", () => {
			const falsyValues = ["false", "0", "no", "off", "arbitrary"];
			for (const val of falsyValues) {
				process.env.FLAG = val;
				expect(env.bool("FLAG")).toBe(false);
			}
		});

		it("returns undefined when variable is not set and no default provided", () => {
			delete process.env.FLAG;
			expect(env.bool("FLAG")).toBeUndefined();
		});

		it("returns defaultValue when unset or empty", () => {
			delete process.env.FLAG;
			expect(env.bool("FLAG", true)).toBe(true);
			expect(env.bool("FLAG", false)).toBe(false);

			process.env.FLAG = "";
			expect(env.bool("FLAG", true)).toBe(true);
		});
	});

	describe("env.array()", () => {
		it("parses comma-separated values, trims items, and filters empty entries", () => {
			process.env.ORIGINS = " https://a.com, https://b.com ,, https://c.com ";
			expect(env.array("ORIGINS")).toEqual([
				"https://a.com",
				"https://b.com",
				"https://c.com",
			]);
		});

		it("supports custom separators", () => {
			process.env.TAGS = "admin|user|moderator";
			expect(env.array("TAGS", "|")).toEqual(["admin", "user", "moderator"]);
		});

		it("returns empty array by default if variable is unset or empty", () => {
			delete process.env.ITEMS;
			expect(env.array("ITEMS")).toEqual([]);

			process.env.ITEMS = "";
			expect(env.array("ITEMS")).toEqual([]);
		});

		it("returns custom default array when variable is unset or empty", () => {
			delete process.env.ITEMS;
			expect(env.array("ITEMS", ",", ["fallback"])).toEqual(["fallback"]);
		});
	});

	describe("env.json()", () => {
		it("parses valid JSON string", () => {
			process.env.CONFIG = JSON.stringify({ timeout: 5000, active: true });
			expect(env.json("CONFIG")).toEqual({ timeout: 5000, active: true });
		});

		it("returns undefined when unset and no default provided", () => {
			delete process.env.CONFIG;
			expect(env.json("CONFIG")).toBeUndefined();
		});

		it("returns defaultValue when unset or empty", () => {
			delete process.env.CONFIG;
			const fallback = { fallback: true };
			expect(env.json("CONFIG", fallback)).toEqual(fallback);

			process.env.CONFIG = "";
			expect(env.json("CONFIG", fallback)).toEqual(fallback);
		});

		it("throws EnvError when variable contains invalid JSON", () => {
			process.env.CONFIG = "{ invalid: json ";
			expect(() => env.json("CONFIG")).toThrow(EnvError);
			expect(() => env.json("CONFIG")).toThrow(
				'Environment variable "CONFIG" is not valid JSON',
			);
		});
	});

	describe("Environment Mode Checkers", () => {
		it("env.is() checks process.env.NODE_ENV against target mode", () => {
			process.env.NODE_ENV = "staging";
			expect(env.is("staging")).toBe(true);
			expect(env.is("production")).toBe(false);
		});

		it("env.is() defaults to development if NODE_ENV is unset", () => {
			delete process.env.NODE_ENV;
			expect(env.is("development")).toBe(true);
			expect(env.is("production")).toBe(false);
		});

		it("correctly identifies production, development, and test environments", () => {
			process.env.NODE_ENV = "production";
			expect(env.isProduction()).toBe(true);
			expect(env.isDevelopment()).toBe(false);
			expect(env.isTest()).toBe(false);

			process.env.NODE_ENV = "development";
			expect(env.isProduction()).toBe(false);
			expect(env.isDevelopment()).toBe(true);
			expect(env.isTest()).toBe(false);

			process.env.NODE_ENV = "test";
			expect(env.isProduction()).toBe(false);
			expect(env.isDevelopment()).toBe(false);
			expect(env.isTest()).toBe(true);
		});
	});
});
