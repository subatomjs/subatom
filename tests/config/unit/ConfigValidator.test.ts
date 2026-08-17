import { describe, expect, it } from "vitest";
import {
	ConfigError,
	validateConfig,
} from "../../../package/config/ConfigValidator.js";
import { DEFAULT_CONFIG } from "../../../package/config/default.config.js";
import type { SubatomConfig } from "../../../package/types/config/SubatomConfig.js";

describe("ConfigValidator", () => {
	it("passes for valid default config", () => {
		expect(() => validateConfig(DEFAULT_CONFIG)).not.toThrow();
	});

	it("validates port range and type", () => {
		const invalidPorts = [0, -1, 65536, NaN, "8080" as any, null as any];
		for (const port of invalidPorts) {
			const config: SubatomConfig = { ...DEFAULT_CONFIG, port };
			expect(() => validateConfig(config)).toThrow(ConfigError);
			expect(() => validateConfig(config)).toThrow(/Invalid value for "port"/);
		}
	});

	it("validates host, entry, and outDir strings", () => {
		expect(() => validateConfig({ ...DEFAULT_CONFIG, host: "" })).toThrow(
			/Invalid value for "host"/,
		);
		expect(() => validateConfig({ ...DEFAULT_CONFIG, host: "   " })).toThrow(
			/Invalid value for "host"/,
		);
		expect(() => validateConfig({ ...DEFAULT_CONFIG, entry: "" })).toThrow(
			/Invalid value for "entry"/,
		);
		expect(() => validateConfig({ ...DEFAULT_CONFIG, outDir: "" })).toThrow(
			/Invalid value for "outDir"/,
		);
	});

	it("validates boolean options (sourcemap, minify, websocket)", () => {
		expect(() =>
			validateConfig({ ...DEFAULT_CONFIG, sourcemap: "true" as any }),
		).toThrow(/Invalid value for "sourcemap"/);
		expect(() =>
			validateConfig({ ...DEFAULT_CONFIG, minify: 1 as any }),
		).toThrow(/Invalid value for "minify"/);
		expect(() =>
			validateConfig({ ...DEFAULT_CONFIG, websocket: null as any }),
		).toThrow(/Invalid value for "websocket"/);
	});

	it("validates watch object structure", () => {
		expect(() =>
			validateConfig({
				...DEFAULT_CONFIG,
				watch: { extensions: "ts" as any, ignore: [] } as any,
			}),
		).toThrow(/Invalid value for "watch"/);
		expect(() =>
			validateConfig({
				...DEFAULT_CONFIG,
				watch: { extensions: [], ignore: "node_modules" as any } as any,
			}),
		).toThrow(/Invalid value for "watch"/);
	});

	it("truncates received string representation over 50 chars in ConfigError", () => {
		const longString = "a".repeat(60);
		const error = new ConfigError("field", "short", longString);
		expect(error.message).toContain("[REDACTED OR TRUNCATED]");
	});
});
