import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
	SubatomConfig,
	SubatomUserConfig,
} from "../types/config/SubatomConfig.js";
import { DEFAULT_CONFIG } from "./default.config.js";

const CONFIG_FILENAMES = [
	"subatom.config.ts",
	"subatom.config.js",
	"subatom.config.mjs",
	"subatom.config.cjs",
	"subatom.config.json",
];

export async function findAndLoadConfig(
	cwd: string = process.cwd(),
): Promise<SubatomConfig> {
	const found = CONFIG_FILENAMES.map((f) => path.join(cwd, f)).find(existsSync);

	if (!found) {
		return { ...DEFAULT_CONFIG };
	}

	try {
		const userConfig = await readUserConfig(found);
		return { ...DEFAULT_CONFIG, ...userConfig };
	} catch (err:unknown) {
		console.warn(
			`[subatom] Failed to load config from ${path.basename(found)}`,
			err,
		);
		return { ...DEFAULT_CONFIG };
	}
}

async function readUserConfig(filePath: string): Promise<SubatomUserConfig> {
	if (filePath.endsWith(".json")) {
		return JSON.parse(readFileSync(filePath, "utf-8"));
	}

	// Direct dynamic import works seamlessly because `tsx` loader is active in dev mode
	try {
		const mod = await import(pathToFileURL(filePath).href);
		return mod.default ?? mod;
	} catch {
		// Fallback: Transpile TS in memory using esbuild without writing temp files to disk
		const source = readFileSync(filePath, "utf-8");
		const { transform } = await import("esbuild");
		const { code } = await transform(source, {
			loader: "ts",
			format: "esm",
			target: "node24",
		});

		const dataUrl = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
		const mod = await import(dataUrl);
		return mod.default ?? mod;
	}
}

export function defineConfig(config: SubatomUserConfig): SubatomUserConfig {
	return config;
}
