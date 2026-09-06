import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as envModule from "../../config/env/env.js";
import {
	getEnvConfigOverride,
	resolveEnvironmentFiles,
} from "../../config/env/envResolver.js";

describe("envResolver", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		process.env = { ...originalEnv };
		vi.clearAllMocks();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.restoreAllMocks();
	});

	it("should resolve env files in order of precedence for current NODE_ENV", () => {
		process.env.NODE_ENV = "staging";
		const configEnvSpy = vi.spyOn(envModule, "configEnv").mockReturnValue({});

		resolveEnvironmentFiles();

		expect(configEnvSpy).toHaveBeenNthCalledWith(1, {
			path: ".env.staging.local",
			strict: false,
			override: false,
		});
		expect(configEnvSpy).toHaveBeenNthCalledWith(2, {
			path: ".env.staging",
			strict: false,
			override: false,
		});
		expect(configEnvSpy).toHaveBeenNthCalledWith(3, {
			path: ".env.local",
			strict: false,
			override: false,
		});
		expect(configEnvSpy).toHaveBeenNthCalledWith(4, {
			path: ".env",
			strict: false,
			override: false,
		});
	});

	it("should resolve env files with development fallback when NODE_ENV is unset", () => {
		delete process.env.NODE_ENV;
		const configEnvSpy = vi.spyOn(envModule, "configEnv").mockReturnValue({});

		resolveEnvironmentFiles();

		expect(configEnvSpy).toHaveBeenNthCalledWith(1, {
			path: ".env.development.local",
			strict: false,
			override: false,
		});
	});

	it("should extract defined environment overrides into config object", () => {
		process.env.PORT = "9090";
		process.env.HOST = "0.0.0.0";
		process.env.SUBATOM_ENTRY = "src/main.ts";
		process.env.SUBATOM_OUTDIR = "build";
		process.env.SUBATOM_SOURCEMAP = "false";
		process.env.SUBATOM_MINIFY = "1";

		const overrides = getEnvConfigOverride();

		expect(overrides).toEqual({
			port: 9090,
			host: "0.0.0.0",
			entry: "src/main.ts",
			outDir: "build",
			sourcemap: false,
			minify: true,
		});
	});

	it("should omit unset environment options from config override", () => {
		delete process.env.PORT;
		delete process.env.HOST;
		delete process.env.SUBATOM_ENTRY;
		delete process.env.SUBATOM_OUTDIR;
		delete process.env.SUBATOM_SOURCEMAP;
		delete process.env.SUBATOM_MINIFY;

		expect(getEnvConfigOverride()).toEqual({});
	});
});
