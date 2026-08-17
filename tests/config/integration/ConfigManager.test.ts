import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigManager } from "../../../package/config/ConfigManager.js";
import { DEFAULT_CONFIG } from "../../../package/config/default.config.js";

vi.mock("node:fs");

describe("ConfigManager Integration", () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		process.env = { ...originalEnv };
		vi.restoreAllMocks();
		vi.spyOn(fs, "existsSync").mockReturnValue(false);
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	it("resolves to DEFAULT_CONFIG when no files, env vars, or runtime overrides exist", async () => {
		const config = await ConfigManager.resolve(undefined, true);
		expect(config).toEqual(DEFAULT_CONFIG);
		expect(Object.isFrozen(config)).toBe(true);
	});

	it("applies precedence order: Default < FileConfig < Env < RuntimeOverrides", async () => {
		vi.spyOn(fs, "existsSync").mockImplementation((p) =>
			p.toString().endsWith("subatom.config.json"),
		);
		vi.spyOn(fs, "readFileSync").mockReturnValue(
			JSON.stringify({ port: 5000, host: "file-host", outDir: "file-dist" }),
		);

		process.env.HOST = "env-host";
		process.env.SUBATOM_OUTDIR = "env-dist";

		const runtimeOverrides = {
			outDir: "runtime-dist",
		};

		const config = await ConfigManager.resolve(runtimeOverrides, true);

		expect(config.port).toBe(5000); // From File
		expect(config.host).toBe("env-host"); // From Env (overrides File)
		expect(config.outDir).toBe("runtime-dist"); // From Runtime (overrides Env)
	});

	it("retrieves cached configuration synchronously via get() after resolve()", async () => {
		const resolved = await ConfigManager.resolve(undefined, true);
		const retrieved = ConfigManager.get();
		expect(retrieved).toBe(resolved);
	});

	it("throws ConfigError during resolution if final configuration is invalid", async () => {
		process.env.PORT = "invalid-port-string";
		await expect(ConfigManager.resolve(undefined, true)).rejects.toThrow(
			/\[Subatom Env Error\]: Environment variable "PORT" is not a valid number/,
		);
	});

	it("does not mutate the global cache when runtimeOverrides are supplied", async () => {
		const base = await ConfigManager.resolve(undefined, true);
		const overrideResult = await ConfigManager.resolve({ port: 9999 });

		expect(overrideResult.port).toBe(9999);
		expect(ConfigManager.get().port).toBe(base.port);
	});
});
