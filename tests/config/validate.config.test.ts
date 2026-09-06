import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigError } from "../../config/ConfigError.js";
import { DEFAULT_CONFIG } from "../../config/helpers/default.config.js";
import { validateConfig } from "../../config/helpers/validate.config.js";
import type { SubatomConfig } from "../../config/types/index.types.js";

vi.mock("node:fs");

describe("validateConfig", () => {
	let validConfig: SubatomConfig;

	beforeEach(() => {
		validConfig = structuredClone(DEFAULT_CONFIG);
		vi.resetAllMocks();
		vi.mocked(fs.existsSync).mockReturnValue(true);
		vi.mocked(fs.statSync).mockReturnValue({
			isDirectory: () => false,
		} as unknown as fs.Stats);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should pass validation for DEFAULT_CONFIG when entry file exists", () => {
		expect(() => validateConfig(validConfig)).not.toThrow();
	});

	describe("port validation", () => {
		it("should reject ports that are not numbers, NaN, or out of bounds (1-65535)", () => {
			const invalidPorts = [0, -1, 65536, Number.NaN, "8080" as unknown as number];

			for (const port of invalidPorts) {
				const cfg = { ...validConfig, port };
				expect(() => validateConfig(cfg)).toThrow(ConfigError);
			}
		});

		it("should accept lower and upper edge boundary port values", () => {
			expect(() => validateConfig({ ...validConfig, port: 1 })).not.toThrow();
			expect(() =>
				validateConfig({ ...validConfig, port: 65535 }),
			).not.toThrow();
		});
	});

	describe("host validation", () => {
		it("should reject non-string or whitespace-only host", () => {
			expect(() =>
				validateConfig({ ...validConfig, host: "" }),
			).toThrow(ConfigError);
			expect(() =>
				validateConfig({ ...validConfig, host: "   " }),
			).toThrow(ConfigError);
			expect(() =>
				validateConfig({ ...validConfig, host: 127 as unknown as string }),
			).toThrow(ConfigError);
		});
	});

	describe("entry validation", () => {
		it("should reject non-string or whitespace-only entry", () => {
			expect(() =>
				validateConfig({ ...validConfig, entry: "" }),
			).toThrow(ConfigError);
			expect(() =>
				validateConfig({ ...validConfig, entry: " \t " }),
			).toThrow(ConfigError);
			expect(() =>
				validateConfig({ ...validConfig, entry: null as unknown as string }),
			).toThrow(ConfigError);
		});

		it("should throw plain Error if entry file does not exist", () => {
			vi.mocked(fs.existsSync).mockReturnValue(false);
			const targetPath = path.resolve(process.cwd(), validConfig.entry);

			expect(() => validateConfig(validConfig)).toThrow(
				`[Subatom Config Error]: Entry file "${validConfig.entry}" does not exist at "${targetPath}".`,
			);
		});

		it("should throw plain Error if entry resolves to a directory", () => {
			vi.mocked(fs.existsSync).mockReturnValue(true);
			vi.mocked(fs.statSync).mockReturnValue({
				isDirectory: () => true,
			} as unknown as fs.Stats);

			expect(() => validateConfig(validConfig)).toThrow(
				`[Subatom Config Error]: Entry "${validConfig.entry}" is a directory. It must point directly to a file.`,
			);
		});
	});

	describe("outDir validation", () => {
		it("should reject non-string or empty outDir", () => {
			expect(() =>
				validateConfig({ ...validConfig, outDir: "" }),
			).toThrow(ConfigError);
			expect(() =>
				validateConfig({ ...validConfig, outDir: "   " }),
			).toThrow(ConfigError);
			expect(() =>
				validateConfig({ ...validConfig, outDir: 123 as unknown as string }),
			).toThrow(ConfigError);
		});
	});

	describe("sourcemap and minify validation", () => {
		it("should reject non-boolean sourcemap", () => {
			expect(() =>
				validateConfig({
					...validConfig,
					sourcemap: "true" as unknown as boolean,
				}),
			).toThrow(ConfigError);
		});

		it("should reject non-boolean minify", () => {
			expect(() =>
				validateConfig({ ...validConfig, minify: 1 as unknown as boolean }),
			).toThrow(ConfigError);
		});
	});

	describe("watch validation", () => {
		it("should reject watch when extensions or ignore are not arrays", () => {
			const invalidWatchConfigs: SubatomConfig["watch"][] = [
				{
					extensions: "ts" as unknown as string[],
					debounceMs: 300,
					ignore: [],
				},
				{
					extensions: ["ts"],
					debounceMs: 300,
					ignore: "node_modules" as unknown as string[],
				},
			];

			for (const watch of invalidWatchConfigs) {
				expect(() =>
					validateConfig({ ...validConfig, watch }),
				).toThrow(ConfigError);
			}
		});

		it("should allow valid watch configurations or watch being undefined", () => {
			expect(() =>
				validateConfig({
					...validConfig,
					watch: { extensions: ["ts"], debounceMs: 100, ignore: [] },
				}),
			).not.toThrow();

			const noWatch = { ...validConfig };
			delete (noWatch as Partial<SubatomConfig>).watch;
			expect(() => validateConfig(noWatch)).not.toThrow();
		});
	});
});