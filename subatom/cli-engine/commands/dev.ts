import { createRequire } from "node:module";
import path from "node:path";
import { findAndLoadConfig } from "../../config/load.config.js";
import { resolveEntry } from "../utils/findEntry.js";
import { logger } from "../utils/logger.js";
import { FrameworkWatcher } from "../watch/FrameworkWatcher.js";
import { ProcessManager } from "../watch/ProcessManager.js";

interface DevOptions {
	port?: string;
	host?: string;
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
		extensions: ["ts", "tsx", "js", "jsx", "mjs", "cjs", "json"],
		debounceMs: 250,
		onChange: (filePath: string) => {
			const relPath = path.relative(cwd, filePath);
			void manager.restart(relPath);
		},
	});

	await watcher.start();

	const shutdown = async () => {
		logger.info("Shutting down dev server...");
		await watcher.close();
		await manager.stop();
		process.exit(0);
	};

	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);
}
