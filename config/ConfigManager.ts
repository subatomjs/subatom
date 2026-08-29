/**
 * @fileoverview Manages Subatom configuration resolution by merging defaults,
 * files, environment overrides, and runtime settings, then validating and caching the result.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type {
	SubatomConfig,
	ISubatomConfig,
} from "./types/subatom.config.types.js";
import {
	getEnvConfigOverride,
	resolveEnvironmentFiles,
} from "./env/envResolver.js";
import {
	DEFAULT_CONFIG,
	findAndLoadConfig,
	validateConfig,
} from "./config.export.js";
import { deepMerge } from "./deepMerge.js";

let cachedConfig: Readonly<SubatomConfig> | null = null;

// biome-ignore lint/complexity/noStaticOnlyClass: explanation
export class ConfigManager {
	public static async resolve(
		runtimeOverrides?: ISubatomConfig,
		forceReload = false,
	): Promise<Readonly<SubatomConfig>> {
		if (cachedConfig && !forceReload && !runtimeOverrides) {
			return cachedConfig;
		}

		resolveEnvironmentFiles();

		const baseFileConfig = await findAndLoadConfig();
		const envConfig = getEnvConfigOverride();

		const merged: SubatomConfig = deepMerge<SubatomConfig>(
			DEFAULT_CONFIG,
			baseFileConfig,
			envConfig,
			runtimeOverrides || {},
		);

		validateConfig(merged);

		const frozen = Object.freeze(merged);

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
