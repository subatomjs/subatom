import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { env, EnvError } from "../../packages/methods/env.js";

declare const process: {
	env: Record<string, string | undefined>;
};

describe("env utility", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe("EnvError", () => {
		test("initializes with name and message", () => {
			const err = new EnvError("Test error");
			expect(err).toBeInstanceOf(Error);
			expect(err.name).toBe("EnvError");
			expect(err.message).toBe("Test error");
		});
	});

	describe("env()", () => {
		test("returns environment value when set and non-empty", () => {
			process.env.APP_PORT = "8080";
			expect(env("APP_PORT")).toBe("8080");
			expect(env("APP_PORT", "3000")).toBe("8080");
		});

		test("returns defaultValue when variable is unset", () => {
			delete process.env.APP_PORT;
			expect(env("APP_PORT")).toBeUndefined();
			expect(env("APP_PORT", "3000")).toBe("3000");
		});

		test("returns defaultValue when variable is an empty string", () => {
			process.env.APP_PORT = "";
			expect(env("APP_PORT")).toBeUndefined();
			expect(env("APP_PORT", "3000")).toBe("3000");
		});
	});

	describe("env.require()", () => {
		test("returns value when present and non-empty", () => {
			process.env.DATABASE_URL = "postgres://localhost:5432/db";
			expect(env.require("DATABASE_URL")).toBe("postgres://localhost:5432/db");
		});

		test("throws EnvError when key is missing", () => {
			delete process.env.DATABASE_URL;
			expect(() => env.require("DATABASE_URL")).toThrow(EnvError);
			expect(() => env.require("DATABASE_URL")).toThrow(
				"Missing required environment variable: DATABASE_URL",
			);
		});

		test("throws EnvError when key is empty string", () => {
			process.env.DATABASE_URL = "";
			expect(() => env.require("DATABASE_URL")).toThrow(EnvError);
		});
	});

	describe("env.number()", () => {
		test("parses valid numeric strings", () => {
			process.env.TIMEOUT = "5000";
			expect(env.number("TIMEOUT")).toBe(5000);
			expect(env.number("TIMEOUT", 1000)).toBe(5000);
		});

		test("returns defaultValue when unset or empty", () => {
			delete process.env.TIMEOUT;
			expect(env.number("TIMEOUT")).toBeUndefined();
			expect(env.number("TIMEOUT", 1000)).toBe(1000);

			process.env.TIMEOUT = "";
			expect(env.number("TIMEOUT", 2000)).toBe(2000);
		});

		test("throws EnvError when value is not a valid number", () => {
			process.env.TIMEOUT = "not_a_number";
			expect(() => env.number("TIMEOUT")).toThrow(EnvError);
			expect(() => env.number("TIMEOUT")).toThrow(
				'Environment variable "TIMEOUT" is not a valid number: "not_a_number"',
			);
		});
	});

	describe("env.bool()", () => {
		test("returns true for truthy values case-insensitively", () => {
			const truthy = ["true", "TRUE", "1", "yes", "YES", "on", "ON"];
			for (const val of truthy) {
				process.env.FLAG = val;
				expect(env.bool("FLAG")).toBe(true);
			}
		});

		test("returns false for non-truthy values", () => {
			const falsy = ["false", "0", "no", "off", "random"];
			for (const val of falsy) {
				process.env.FLAG = val;
				expect(env.bool("FLAG")).toBe(false);
			}
		});

		test("returns defaultValue when unset or empty", () => {
			delete process.env.FLAG;
			expect(env.bool("FLAG")).toBeUndefined();
			expect(env.bool("FLAG", true)).toBe(true);
			expect(env.bool("FLAG", false)).toBe(false);

			process.env.FLAG = "";
			expect(env.bool("FLAG", true)).toBe(true);
		});
	});

	describe("env.array()", () => {
		test("splits, trims, and filters empty strings", () => {
			process.env.CORS_ORIGINS = " http://localhost:3000, , http://app.local ";
			expect(env.array("CORS_ORIGINS")).toEqual([
				"http://localhost:3000",
				"http://app.local",
			]);
		});

		test("supports custom separator", () => {
			process.env.PORTS = "80|443|8080";
			expect(env.array("PORTS", "|")).toEqual(["80", "443", "8080"]);
		});

		test("returns defaultValue when unset or empty", () => {
			delete process.env.LIST;
			expect(env.array("LIST")).toEqual([]);
			expect(env.array("LIST", ",", ["a", "b"])).toEqual(["a", "b"]);

			process.env.LIST = "";
			expect(env.array("LIST", ",", ["fallback"])).toEqual(["fallback"]);
		});
	});

	describe("env.json()", () => {
		test("parses valid JSON string", () => {
			process.env.METRIC_CONFIG = '{"enabled":true,"rate":10}';
			expect(
				env.json<{ enabled: boolean; rate: number }>("METRIC_CONFIG"),
			).toEqual({
				enabled: true,
				rate: 10,
			});
		});

		test("returns defaultValue when unset or empty", () => {
			delete process.env.METRIC_CONFIG;
			expect(env.json("METRIC_CONFIG")).toBeUndefined();
			expect(env.json("METRIC_CONFIG", { fallback: true })).toEqual({
				fallback: true,
			});

			process.env.METRIC_CONFIG = "";
			expect(env.json("METRIC_CONFIG", { fallback: true })).toEqual({
				fallback: true,
			});
		});

		test("throws EnvError when value is not valid JSON", () => {
			process.env.METRIC_CONFIG = "{invalid_json";
			expect(() => env.json("METRIC_CONFIG")).toThrow(EnvError);
			expect(() => env.json("METRIC_CONFIG")).toThrow(
				'Environment variable "METRIC_CONFIG" is not valid JSON',
			);
		});
	});

	describe("Environment flags", () => {
		test("env.is() evaluates NODE_ENV and falls back to development", () => {
			delete process.env.NODE_ENV;
			expect(env.is("development")).toBe(true);
			expect(env.is("production")).toBe(false);

			process.env.NODE_ENV = "staging";
			expect(env.is("staging")).toBe(true);
		});

		test("env.isProduction()", () => {
			process.env.NODE_ENV = "production";
			expect(env.isProduction()).toBe(true);
			process.env.NODE_ENV = "development";
			expect(env.isProduction()).toBe(false);
		});

		test("env.isDevelopment()", () => {
			delete process.env.NODE_ENV;
			expect(env.isDevelopment()).toBe(true);
			process.env.NODE_ENV = "production";
			expect(env.isDevelopment()).toBe(false);
		});

		test("env.isTest()", () => {
			process.env.NODE_ENV = "test";
			expect(env.isTest()).toBe(true);
			process.env.NODE_ENV = "production";
			expect(env.isTest()).toBe(false);
		});
	});
});
