import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configEnv, env } from "../../../package/config/env/env.js";

vi.mock("node:fs");

describe("configEnv & env helper", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		vi.resetModules();
		process.env = { ...originalEnv };
		vi.restoreAllMocks();
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe("configEnv", () => {
		it("returns empty object if .env file does not exist when strict is false", () => {
			vi.spyOn(fs, "existsSync").mockReturnValue(false);
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			const res = configEnv({ path: ".env.nonexistent", strict: false });
			expect(res).toEqual({});
			expect(warnSpy).not.toHaveBeenCalled();
		});

		it("throws an error when file does not exist and strict is true", () => {
			vi.spyOn(fs, "existsSync").mockReturnValue(false);
			expect(() => {
				configEnv({ path: ".env.strict", strict: true });
			}).toThrow(
				/\[Subatom Env Error\]: Failed to load .* — Env file not found/,
			);
		});

		it("loads and parses .env file into process.env without overriding existing keys by default", () => {
			process.env.EXISTING_KEY = "existing_value";
			vi.spyOn(fs, "existsSync").mockReturnValue(true);
			vi.spyOn(fs, "readFileSync").mockReturnValue(
				"EXISTING_KEY=new_value\nNEW_KEY=loaded_value",
			);

			const parsed = configEnv({ path: ".env" });

			expect(parsed).toEqual({
				EXISTING_KEY: "new_value",
				NEW_KEY: "loaded_value",
			});
			expect(process.env.EXISTING_KEY).toBe("existing_value");
			expect(process.env.NEW_KEY).toBe("loaded_value");
			expect(env.isLoaded).toBe(true);
		});

		it("overrides process.env keys when override option is true", () => {
			process.env.OVERRIDE_TARGET = "initial";
			vi.spyOn(fs, "existsSync").mockReturnValue(true);
			vi.spyOn(fs, "readFileSync").mockReturnValue("OVERRIDE_TARGET=updated");

			configEnv({ path: ".env", override: true });

			expect(process.env.OVERRIDE_TARGET).toBe("updated");
		});

		it("handles filesystem read errors gracefully with a warning when strict is false", () => {
			vi.spyOn(fs, "existsSync").mockReturnValue(true);
			vi.spyOn(fs, "readFileSync").mockImplementation(() => {
				throw new Error("EACCES: permission denied");
			});
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			const res = configEnv({ strict: false });
			expect(res).toEqual({});
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					"[Subatom Env Warning]: Failed to load env file",
				),
			);
		});
	});

	describe("env accessors", () => {
		it("evaluates NODE_ENV flags accurately", () => {
			process.env.NODE_ENV = "development";
			expect(env.NODE_ENV).toBe("development");
			expect(env.isDev).toBe(true);
			expect(env.isProd).toBe(false);
			expect(env.isTest).toBe(false);

			process.env.NODE_ENV = "production";
			expect(env.isDev).toBe(false);
			expect(env.isProd).toBe(true);

			process.env.NODE_ENV = "test";
			expect(env.isTest).toBe(true);

			delete process.env.NODE_ENV;
			expect(env.NODE_ENV).toBe("development");
			expect(env.isDev).toBe(true);
		});

		it("gets raw string values and respects defaults", () => {
			process.env.DEFINED = "val";
			expect(env.get("DEFINED")).toBe("val");
			expect(env.get("UNDEFINED_VAR", "fallback")).toBe("fallback");
			expect(env.get("UNDEFINED_NO_DEFAULT")).toBe("");
		});

		it("retrieves required values and throws descriptive error if missing or empty", () => {
			process.env.DB_PASS = "secret";
			expect(env.getRequired("DB_PASS")).toBe("secret");

			delete process.env.DB_PASS;
			expect(() => env.getRequired("DB_PASS")).toThrow(
				'[Subatom Env Error]: Missing required environment variable "DB_PASS"',
			);

			process.env.EMPTY_PASS = "";
			expect(() => env.getRequired("EMPTY_PASS")).toThrow(
				'[Subatom Env Error]: Missing required environment variable "EMPTY_PASS"',
			);
		});

		it("parses numbers and handles valid, default, missing, and invalid values", () => {
			process.env.PORT = "9000";
			expect(env.getNumber("PORT")).toBe(9000);

			delete process.env.PORT;
			expect(env.getNumber("PORT", 3000)).toBe(3000);

			expect(() => env.getNumber("PORT")).toThrow(
				'[Subatom Env Error]: Missing numeric environment variable "PORT"',
			);

			process.env.INVALID_NUM = "not-a-number";
			expect(() => env.getNumber("INVALID_NUM")).toThrow(
				'[Subatom Env Error]: Environment variable "INVALID_NUM" is not a valid number: "not-a-number"',
			);
		});

		it("parses booleans correctly across all truthy/falsy representations", () => {
			const truthy = ["true", "1", "yes", "on", " TRUE ", "On"];
			for (const val of truthy) {
				process.env.BOOL_VAR = val;
				expect(env.getBoolean("BOOL_VAR")).toBe(true);
			}

			const falsy = ["false", "0", "no", "off", "random"];
			for (const val of falsy) {
				process.env.BOOL_VAR = val;
				expect(env.getBoolean("BOOL_VAR")).toBe(false);
			}

			delete process.env.BOOL_VAR;
			expect(env.getBoolean("BOOL_VAR", true)).toBe(true);
			expect(env.getBoolean("BOOL_VAR", false)).toBe(false);
		});

		it("checks existence accurately via has()", () => {
			process.env.PRESENT = "value";
			process.env.EMPTY = "";
			delete process.env.MISSING;

			expect(env.has("PRESENT")).toBe(true);
			expect(env.has("EMPTY")).toBe(false);
			expect(env.has("MISSING")).toBe(false);
		});

		it("returns a frozen snapshot of loadedKeys via getAll()", () => {
			vi.spyOn(fs, "existsSync").mockReturnValue(true);
			vi.spyOn(fs, "readFileSync").mockReturnValue(
				"SNAPSHOT_A=1\nSNAPSHOT_B=2",
			);
			configEnv({ path: ".env" });

			const snapshot = env.getAll();
			expect(snapshot).toEqual({
				SNAPSHOT_A: "1",
				SNAPSHOT_B: "2",
			});
			expect(Object.isFrozen(snapshot)).toBe(true);
		});
	});
});
