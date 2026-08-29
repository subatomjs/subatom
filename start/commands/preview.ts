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

export async function runPreview(): Promise<void> {
	const cwd = process.cwd();
	const config = await findAndLoadConfig(cwd);

	const outDir = path.resolve(cwd, config.outDir);

	const entryPath = path.resolve(cwd, config.entry);
	const entryDir = path.dirname(entryPath);
	const entryFile = path.basename(entryPath);

	const sourceRoot = path.resolve(
		cwd,
		path.dirname(config.entry).split(path.sep)[0] || "src",
	);

	const relativeEntry = path.relative(sourceRoot, entryDir);

	const compiledEntry = path.join(
		outDir,
		relativeEntry,
		entryFile.replace(/\.(tsx?|mts|cts|jsx?|mjs|cjs)$/, ".js"),
	);

	if (!existsSync(compiledEntry)) {
		logger.error(
			`No production build found at ${path.relative(cwd, compiledEntry)}`,
		);
		logger.info(`Run "subatom build" before starting the production preview.`);
		process.exit(1);
	}

	const port = await resolvePort(config.port, config.host);

	const protocol = config.host !== "localhost" ? "https" : "http";
	const host = config.host;

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
