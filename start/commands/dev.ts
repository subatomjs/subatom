/**
 * @fileoverview The dev.ts will start development server on run dev command.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { createRequire } from "node:module";
import path from "node:path";
import { findAndLoadConfig } from "../../config/helpers/index.config.js";
import { logger, resolveEntry } from "../utils/index.js";
import { ProcessManager, FrameworkWatcher } from "../watch/index.js";
import type { NormalizedWatchEvent } from "../types/index.types.js";
import { ProcessLifecycle } from "../life-cycle/ProcessLifecycle.js";

interface DevOptions {
	readonly port?: string | undefined;
	readonly host?: string | undefined;
}

export async function runDev(opts: DevOptions): Promise<void> {
	const cwd = process.cwd();
	const config = await findAndLoadConfig(cwd);

	const entry = resolveEntry(config.entry, cwd);
	const host = opts.host ?? config.host ?? "localhost";
	const preferredPort = opts.port ? Number(opts.port) : (config.port ?? 8080);

	if (Number.isNaN(preferredPort)) {
		logger.error(`Invalid port: "${opts.port}"`);
		process.exit(1);
	}

	const require = createRequire(import.meta.url);
	const tsxCliPath = require.resolve("tsx/cli");

	logger.info(`Watching workspace for changes...`);

	const manager = new ProcessManager({
		command: process.execPath,
		args: [tsxCliPath, "--no-cache", entry],
		cwd,
		label: "dev server",
		env: {
			NODE_ENV: "development",
			PORT: String(preferredPort),
			HOST: host,
		},
	});

	manager.start();

	const watcher = new FrameworkWatcher({
		watchPaths: [cwd],
		extensions: ["ts", "js", "ejs", "html", "json"],
		debounceMs: 150,
		onChange: (filePath: string, batch?: readonly NormalizedWatchEvent[]) => {
			const relPath = path.relative(cwd, filePath);
			const summary =
				batch && batch.length > 1
					? `${batch.length} files (${relPath} and others)`
					: relPath;

			void manager.restart(summary);
		},
		onError: (error: Error) => {
			logger.error(`Watcher error: ${error.message}`);
		},
	});

	await watcher.start();

	const lifecycle = ProcessLifecycle.getInstance();
	lifecycle.onShutdown(async () => {
		logger.info("Shutting down dev server...");
		await watcher.close();
		await manager.stop();
	});
}
