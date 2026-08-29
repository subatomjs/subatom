/**
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ISubatomConfig } from "../types/index.types.js";
import { configEnv, env } from "./env.js"; // Existing env module

/**
 * Loads environment files in deterministic highest-to-lowest order.
 * Since configEnv defaults to `override: false`, loading the highest
 * precedence files first guarantees they win without overwriting pre-existing
 * `process.env` values (which have ultimate precedence).
 */
export function resolveEnvironmentFiles(): void {
	const mode = env.get("NODE_ENV", "development");

	const filesToLoad = [
		`.env.${mode}.local`,
		`.env.${mode}`,
		`.env.local`,
		`.env`,
	];

	for (const file of filesToLoad) {
		// configEnv handles existence checks safely and populates loadedKeys
		configEnv({ path: file, strict: false, override: false });
	}
}

/**
 * Extracts and maps relevant process.env values to a Partial<SubatomConfig>.
 * Explicit mappings avoid polluting config with unrelated env variables.
 */
export function getEnvConfigOverride(): ISubatomConfig {
	const override: ISubatomConfig = {};

	if (env.has("PORT")) override.port = env.getNumber("PORT");
	if (env.has("HOST")) override.host = env.get("HOST");
	if (env.has("SUBATOM_ENTRY")) override.entry = env.get("SUBATOM_ENTRY");
	if (env.has("SUBATOM_OUTDIR")) override.outDir = env.get("SUBATOM_OUTDIR");
	if (env.has("SUBATOM_SOURCEMAP"))
		override.sourcemap = env.getBoolean("SUBATOM_SOURCEMAP");
	if (env.has("SUBATOM_MINIFY"))
		override.minify = env.getBoolean("SUBATOM_MINIFY");
	if (env.has("SUBATOM_WEBSOCKET"))
		override.websocket = env.getBoolean("SUBATOM_WEBSOCKET");

	return override;
}
