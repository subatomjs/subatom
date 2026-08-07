import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { transform } from "esbuild";
import { logger } from "../utils/logger.js";
import { DEFAULT_CONFIG } from "./defaults.js";
import type { SubatomConfig, SubatomUserConfig } from "./types.js";

const CONFIG_FILENAMES = [
	"subatom.config.ts",
	"subatom.config.js",
	"subatom.config.mjs",
	"subatom.config.json",
];

export async function loadConfig(
	cwd: string = process.cwd(),
): Promise<SubatomConfig> {
	const found = CONFIG_FILENAMES.map((f) => path.join(cwd, f)).find(existsSync);

	if (!found) {
		return { ...DEFAULT_CONFIG };
	}

	try {
		const userConfig = await readUserConfig(found);
		return { ...DEFAULT_CONFIG, ...userConfig };
	} catch (err) {
		logger.error(`Failed to load config from ${path.basename(found)}`);
		throw err;
	}
}

async function readUserConfig(filePath: string): Promise<SubatomUserConfig> {
	if (filePath.endsWith(".json")) {
		return JSON.parse(readFileSync(filePath, "utf-8"));
	}

	if (filePath.endsWith(".ts")) {
		// Strip types in-memory, then import as a temporary ESM module.
		const source = readFileSync(filePath, "utf-8");
		const { code } = await transform(source, {
			loader: "ts",
			format: "esm",
			target: "node18",
		});

		const tempPath = filePath.replace(/\.ts$/, `.${Date.now()}.mjs`);
		const { writeFileSync, unlinkSync } = await import("node:fs");
		writeFileSync(tempPath, code);

		try {
			const mod = await import(pathToFileURL(tempPath).href);
			return mod.default ?? mod;
		} finally {
			unlinkSync(tempPath);
		}
	}

	// .js / .mjs — import directly
	const mod = await import(pathToFileURL(filePath).href);
	return mod.default ?? mod;
}

export function defineConfig(config: SubatomUserConfig): SubatomUserConfig {
	return config;
}
