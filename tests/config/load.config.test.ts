import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../../config/helpers/default.config.js";
import {
	defineConfig,
	findAndLoadConfig,
} from "../../config/helpers/load.config.js";

vi.mock("node:fs");

describe("load.config", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("defineConfig", () => {
		it("should identity-return the config passed to it", () => {
			const input = { port: 3000, host: "0.0.0.0" };
			expect(defineConfig(input)).toBe(input);
		});
	});

	describe("findAndLoadConfig", () => {
		it("should return clone of DEFAULT_CONFIG if no configuration file is found", async () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);

			const config = await findAndLoadConfig("/app");
			expect(config).toEqual(DEFAULT_CONFIG);
			expect(config).not.toBe(DEFAULT_CONFIG);
		});

		it("should parse and merge JSON config when subatom.config.json is present", async () => {
			vi.mocked(fs.existsSync).mockImplementation((p) =>
				String(p).endsWith("subatom.config.json"),
			);
			vi.mocked(fs.readFileSync).mockReturnValue(
				JSON.stringify({ port: 4200, minify: true }),
			);

			const config = await findAndLoadConfig("/app");
			expect(config.port).toBe(4200);
			expect(config.minify).toBe(true);
			expect(config.entry).toBe(DEFAULT_CONFIG.entry);
		});

		it("should fall back to DEFAULT_CONFIG and warn if reading config throws", async () => {
			vi.mocked(fs.existsSync).mockImplementation((p) =>
				String(p).endsWith("subatom.config.json"),
			);
			vi.mocked(fs.readFileSync).mockImplementation(() => {
				throw new Error("Corrupted JSON file");
			});

			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			const config = await findAndLoadConfig("/app");
			expect(config).toEqual(DEFAULT_CONFIG);
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					"[subatom] Failed to load config from subatom.config.json",
				),
				expect.any(Error),
			);
		});
	});
});
