/**
 * @fileoverview Loads subatom.config from supported TypeScript,
 * JavaScript, or JSON files, importing the first valid configuration and falling back to an empty config.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ISubatomServerConfig } from "../types/subatom.server.types.js";

interface ConfigModuleShape {
	default?: ISubatomServerConfig;
	config?: ISubatomServerConfig;
}

const SUPPORTED_EXTENSIONS = [
	"ts",
	"js",
	"mjs",
	"cjs",
	"mts",
	"cts",
	"json",
] as const;

export async function findAndLoadConfig(): Promise<ISubatomServerConfig> {
	const cwd = process.cwd();

	for (const ext of SUPPORTED_EXTENSIONS) {
		const configPath = path.resolve(cwd, `subatom.config.${ext}`);

		if (!fs.existsSync(configPath)) {
			continue;
		}

		try {
			if (ext === "json") {
				const fileContent = fs.readFileSync(configPath, "utf-8");
				return JSON.parse(fileContent) as ISubatomServerConfig;
			}

			// Convert path to file URL to ensure cross-platform ESM compatibility (e.g. Windows paths)
			const fileUrl = pathToFileURL(configPath).href;
			const configModule = (await import(
				/* webpackIgnore: true */ fileUrl
			)) as ConfigModuleShape;

			return configModule.default || configModule.config || {};
		} catch {
			// Continue searching or fallback if loading the matched file fails
			break;
		}
	}

	return {};
}
