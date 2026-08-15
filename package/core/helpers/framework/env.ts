export class EnvError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EnvError";
	}
}

const TRUTHY = new Set(["true", "1", "yes", "on"]);

/**
 * Read a raw string environment variable, with an optional default.
 *
 * @example
 * env('PORT')              // string | undefined
 * env('PORT', '3000')      // always a string
 */
export function env(key: string, defaultValue?: string): string | undefined {
	const value = process.env[key];
	return value !== undefined && value !== "" ? value : defaultValue;
}

/** Read a required env var, throwing an `EnvError` if it's missing/empty. */
env.require = function require_(key: string): string {
	const value = process.env[key];
	if (value === undefined || value === "") {
		throw new EnvError(`Missing required environment variable: ${key}`);
	}
	return value;
};

/** Read an env var as a number, throwing if it's set but not numeric. */
env.number = function number(
	key: string,
	defaultValue?: number,
): number | undefined {
	const raw = process.env[key];
	if (raw === undefined || raw === "") return defaultValue;

	const parsed = Number(raw);
	if (Number.isNaN(parsed)) {
		throw new EnvError(
			`Environment variable "${key}" is not a valid number: "${raw}"`,
		);
	}
	return parsed;
};

/** Read an env var as a boolean. Accepts true/1/yes/on (case-insensitive). */
env.bool = function bool(
	key: string,
	defaultValue?: boolean,
): boolean | undefined {
	const raw = process.env[key];
	if (raw === undefined || raw === "") return defaultValue;
	return TRUTHY.has(raw.toLowerCase());
};

/** Read a delimited env var (e.g. "a,b,c") as a trimmed string array. */
env.array = function array(
	key: string,
	separator = ",",
	defaultValue: string[] = [],
): string[] {
	const raw = process.env[key];
	if (raw === undefined || raw === "") return defaultValue;
	return raw
		.split(separator)
		.map((s) => s.trim())
		.filter(Boolean);
};

/** Read and JSON.parse an env var, throwing if it's set but invalid JSON. */
env.json = function json<T = unknown>(
	key: string,
	defaultValue?: T,
): T | undefined {
	const raw = process.env[key];
	if (raw === undefined || raw === "") return defaultValue;
	try {
		return JSON.parse(raw) as T;
	} catch {
		throw new EnvError(`Environment variable "${key}" is not valid JSON`);
	}
};

/** Check NODE_ENV against a given mode (defaults to 'development' if unset). */
env.is = function is(mode: string): boolean {
	return (process.env.NODE_ENV || "development") === mode;
};

env.isProduction = (): boolean => env.is("production");
env.isDevelopment = (): boolean => env.is("development");
env.isTest = (): boolean => env.is("test");
