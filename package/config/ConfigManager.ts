// src/config/ConfigManager.ts

import type {
	SubatomConfig,
	SubatomUserConfig,
} from "../types/config/SubatomConfig.js";
import { deepMerge } from "./ConfigMerger.js";
import { validateConfig } from "./ConfigValidator.js";
import { DEFAULT_CONFIG } from "./default.config.js";
import {
	getEnvConfigOverride,
	resolveEnvironmentFiles,
} from "./env/EnvResolver.js";
import { findAndLoadConfig } from "./load.config.js";

let cachedConfig: Readonly<SubatomConfig> | null = null;

export class ConfigManager {
	/**
	 * Resolves, validates, and caches the final immutable configuration pipeline.
	 */
	public static async resolve(
		runtimeOverrides?: SubatomUserConfig,
		forceReload = false,
	): Promise<Readonly<SubatomConfig>> {
		if (cachedConfig && !forceReload && !runtimeOverrides) {
			return cachedConfig;
		}

		// 1. Resolve multi-environment file chain (populates process.env)
		resolveEnvironmentFiles();

		// 2. Load framework config files (subatom.config.*)
		// Note: findAndLoadConfig already returns DEFAULT_CONFIG deep merged with the file.
		// We will do a full strict pipeline deep merge here instead for absolute safety.
		const baseFileConfig = await findAndLoadConfig();

		// 3. Extract explicit ENV mapping overrides
		const envConfig = getEnvConfigOverride();

		// 4. Deterministic Deep Merge
		// Lowest -> Highest precedence:
		// Default -> ConfigFile -> Env -> Runtime
		const merged: SubatomConfig = deepMerge<SubatomConfig>(
			DEFAULT_CONFIG,
			baseFileConfig,
			envConfig,
			runtimeOverrides || {},
		);

		// 5. Validate before server startup
		validateConfig(merged);

		// 6. Freeze and Cache
		const frozen = Object.freeze(merged);

		// Only update the global cache if there are no ephemeral runtime overrides
		// to prevent cross-contamination if start() is called multiple times.
		if (!runtimeOverrides) {
			cachedConfig = frozen;
		}

		return frozen;
	}

	public static get(): Readonly<SubatomConfig> {
		if (!cachedConfig) {
			throw new Error(
				"[Subatom] Configuration has not been resolved yet. Call ConfigManager.resolve() first.",
			);
		}
		return cachedConfig;
	}
}
