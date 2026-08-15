// config/env.ts
import fs from "node:fs";
import path from "node:path";
import type { EnvOptions } from "../../types/config/EnvOptions.js";
import { parseEnv } from "./parseEnv.js";

/** Tracks which keys were loaded from file, and whether loading has happened. */
export let loadedKeys: string[] = [];
export let hasLoaded = false;

/**
 * Loads a .env file into process.env.
 * Idempotent by default — safe to call multiple times; only the first
 * call per unique options actually hits the filesystem unless `override`
 * behavior requires re-resolution. Call once at app startup.
 */
export function configEnv(options: EnvOptions = {}): Record<string, string> {
	const envPath = path.resolve(process.cwd(), options.path ?? ".env");
	const encoding = options.encoding ?? "utf-8";
	const override = options.override ?? false;
	const strict = options.strict ?? false;

	try {
		if (!fs.existsSync(envPath)) {
			if (strict) {
				throw new Error(`Env file not found at ${envPath}`);
			}
			return {};
		}

		const envContent = fs.readFileSync(envPath, { encoding });
		const parsed = parseEnv(envContent);
		loadedKeys = Array.from(new Set([...loadedKeys, ...Object.keys(parsed)]));
		hasLoaded = true;

		for (const [key, val] of Object.entries(parsed)) {
			if (override || process.env[key] === undefined) {
				process.env[key] = val;
			}
		}

		return parsed;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (strict) {
			throw new Error(
				`[Subatom Env Error]: Failed to load ${envPath} — ${message}`,
			);
		}
		console.warn(
			`[Subatom Env Warning]: Failed to load env file from ${envPath}: ${message}`,
		);
		return {};
	}
}

function parseBoolean(raw: string): boolean {
	return ["true", "1", "yes", "on"].includes(raw.trim().toLowerCase());
}

/**
 * Environment helpers for Subatom framework internals.
 * Reads live from process.env — always reflects the current state,
 * including values set outside configEnv() (CI, shell, Docker, etc).
 */
export const env = {
	get NODE_ENV(): string {
		return process.env.NODE_ENV || "development";
	},
	get isDev(): boolean {
		return this.NODE_ENV === "development";
	},
	get isProd(): boolean {
		return this.NODE_ENV === "production";
	},
	get isTest(): boolean {
		return this.NODE_ENV === "test";
	},

	/** Get a raw string value, with optional default. */
	get(key: string, defaultValue = ""): string {
		return process.env[key] ?? defaultValue;
	},

	/** Get a required string value; throws if missing/empty. Use for critical config. */
	getRequired(key: string): string {
		const value = process.env[key];
		if (value === undefined || value === "") {
			throw new Error(
				`[Subatom Env Error]: Missing required environment variable "${key}"`,
			);
		}
		return value;
	},

	/** Get a value parsed as a number, with optional default. */
	getNumber(key: string, defaultValue?: number): number {
		const raw = process.env[key];
		if (raw === undefined || raw === "") {
			if (defaultValue === undefined) {
				throw new Error(
					`[Subatom Env Error]: Missing numeric environment variable "${key}"`,
				);
			}
			return defaultValue;
		}
		const num = Number(raw);
		if (Number.isNaN(num)) {
			throw new Error(
				`[Subatom Env Error]: Environment variable "${key}" is not a valid number: "${raw}"`,
			);
		}
		return num;
	},

	/** Get a value parsed as a boolean ("true"/"1"/"yes"/"on" → true), with optional default. */
	getBoolean(key: string, defaultValue = false): boolean {
		const raw = process.env[key];
		return raw === undefined ? defaultValue : parseBoolean(raw);
	},

	/** Whether a key is present in process.env (and non-empty). */
	has(key: string): boolean {
		return process.env[key] !== undefined && process.env[key] !== "";
	},

	/** Whether configEnv() has been called at least once successfully. */
	get isLoaded(): boolean {
		return hasLoaded;
	},

	/** Snapshot of all variables originally loaded from .env file(s), with current values. */
	getAll(): Readonly<Record<string, string>> {
		const result: Record<string, string> = {};
		for (const key of loadedKeys) {
			const value = process.env[key];
			if (value !== undefined) result[key] = value;
		}
		return Object.freeze(result);
	},
};
