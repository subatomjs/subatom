import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../../config/helpers/default.config.js";

const { findAndLoadConfigMock, validateConfigMock } = vi.hoisted(() => ({
	findAndLoadConfigMock: vi.fn(),
	validateConfigMock: vi.fn(),
}));

vi.mock("../../config/helpers/load.config.js", () => ({
	findAndLoadConfig: findAndLoadConfigMock,
	defineConfig: (c: unknown) => c,
}));

vi.mock("../../config/helpers/validate.config.js", () => ({
	validateConfig: validateConfigMock,
}));

vi.mock("../../config/env/envResolver.js", () => ({
	resolveEnvironmentFiles: vi.fn(),
	getEnvConfigOverride: vi.fn(() => ({})),
}));

import { ConfigManager } from "../../config/ConfigManager.js";
import { resolveEnvironmentFiles } from "../../config/env/envResolver.js";

describe("ConfigManager", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		findAndLoadConfigMock.mockResolvedValue({ ...DEFAULT_CONFIG });
		validateConfigMock.mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should throw error when ConfigManager.get() is called before resolve()", () => {
		try {
			ConfigManager.get();
		} catch (error: unknown) {
			expect(error).toBeInstanceOf(Error);
			expect((error as Error).message).toBe(
				"[Subatom] Configuration has not been resolved yet. Call ConfigManager.resolve() first.",
			);
		}
	});

	it("should resolve, validate, freeze, and cache the configuration", async () => {
		const config = await ConfigManager.resolve(undefined, true);

		expect(config).toEqual(DEFAULT_CONFIG);
		expect(Object.isFrozen(config)).toBe(true);
		expect(ConfigManager.get()).toBe(config);
		expect(validateConfigMock).toHaveBeenCalledWith(config);
		expect(resolveEnvironmentFiles).toHaveBeenCalled();
	});

	it("should return cached configuration on subsequent calls when not forcing reload", async () => {
		// Prime the cache
		const configFirst = await ConfigManager.resolve(undefined, true);
		findAndLoadConfigMock.mockClear();

		// Second call should return cached instance without hitting findAndLoadConfig
		const configSecond = await ConfigManager.resolve();
		expect(configSecond).toBe(configFirst);
		expect(findAndLoadConfigMock).not.toHaveBeenCalled();
	});

	it("should re-resolve when forceReload is true", async () => {
		await ConfigManager.resolve(undefined, true);
		findAndLoadConfigMock.mockClear();

		await ConfigManager.resolve(undefined, true);
		expect(findAndLoadConfigMock).toHaveBeenCalledTimes(1);
	});

	it("should not overwrite global cachedConfig when runtimeOverrides are supplied", async () => {
		const initialConfig = await ConfigManager.resolve(undefined, true);

		const runtimeConfig = await ConfigManager.resolve({ port: 9999 });
		expect(runtimeConfig.port).toBe(9999);
		expect(ConfigManager.get().port).toBe(initialConfig.port);
		expect(ConfigManager.get()).toBe(initialConfig);
	});
});
