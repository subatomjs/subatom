/**
 * @fileoverview The preview.ts is handle run preview command.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { findAndLoadConfig } from "../../config/helpers/load.config.js";
import { resolvePort, runProcess, logger } from "../utils/index.js";
import { resolveEntry } from "../utils/resolveEntry.js";

export async function runPreview(): Promise<void> {
	const cwd = process.cwd();
	const config = await findAndLoadConfig(cwd);

	let entryFile: string;
	try {
		entryFile = resolveEntry(config.entry, cwd);
	} catch (err: unknown) {
		logger.error(err instanceof Error ? err.message : String(err));
		process.exit(1);
	}

	const outDir = path.resolve(cwd, config.outDir ?? "dist");
	const relativeToCwd = path.relative(cwd, entryFile);
	const firstSegment = relativeToCwd.split(path.sep)[0] ?? ".";

	const sourceRoot =
		path.dirname(relativeToCwd) === "" ? cwd : path.resolve(cwd, firstSegment);

	const relativeEntry = path.relative(sourceRoot, entryFile);
	const compiledRelativeEntry = relativeEntry.replace(
		/\.(tsx?|mts|cts|jsx?|mjs|cjs)$/,
		".js",
	);

	const compiledEntry = path.resolve(outDir, compiledRelativeEntry);

	if (!existsSync(compiledEntry)) {
		logger.error(
			`No production build found at ${path.relative(cwd, compiledEntry)}`,
		);
		logger.info(`Run "subatom build" before starting the production preview.`);
		process.exit(1);
	}

	const host = config.host ?? "localhost";
	const port = await resolvePort(config.port ?? 8080, host);

	const protocol = host !== "localhost" ? "https" : "http";
	const previewUrl = `${protocol}://${host}:${port}`;

	logger.info("Starting production preview...");
	logger.success(previewUrl);

	runProcess(process.execPath, [compiledEntry], {
		cwd,
		label: "preview server",
		env: {
			NODE_ENV: "production",
			PORT: String(port),
			HOST: host,
		},
	});
}
