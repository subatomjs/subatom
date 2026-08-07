// subatom/src/commands/dev.ts
import { createRequire } from "node:module";
import path from "node:path";
import { loadConfig } from "../config/load-config.js";
import { resolveEntry } from "../utils/find-entry.js";
import { logger } from "../utils/logger.js";
import { resolvePort } from "../utils/port.js";
import { createWatcher } from "../watch/file-watcher.js";
import { ProcessManager } from "../watch/process-manager.js";

interface DevOptions {
	port?: string;
	host?: string;
}

export async function runDev(opts: DevOptions): Promise<void> {
	const cwd = process.cwd();
	const config = await loadConfig(cwd);

	const entry = resolveEntry(config.entry, cwd);
	const host = opts.host ?? config.host;
	const preferredPort = opts.port ? Number(opts.port) : config.port;

	if (Number.isNaN(preferredPort)) {
		logger.error(`Invalid port: "${opts.port}"`);
		process.exit(1);
	}

	const port = await resolvePort(preferredPort, host);

	const require = createRequire(import.meta.url);
	const tsxCliPath = require.resolve("tsx/cli");

	logger.info(
		`Watching ${path.relative(cwd, path.dirname(entry))} for changes...`,
	);
	logger.success(
		`Server: http://${host === "0.0.0.0" ? "localhost" : host}:${port}`,
	);

	const manager = new ProcessManager({
		command: process.execPath,
		args: [tsxCliPath, entry],
		cwd,
		label: "dev server",
		env: {
			NODE_ENV: "development",
			PORT: String(port),
			HOST: host,
		},
	});

	manager.start();

	const watcher = createWatcher({
		watchDir: path.dirname(entry), // ✅ fixed — use real folder, no string splitting
		extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"],
		debounceMs: 300,
		onChange: (file) => {
			manager.restart(path.relative(cwd, file));
		},
	});

	const shutdown = () => {
		logger.info("Shutting down dev server...");
		watcher.close();
		manager.stop();
		process.exit(0);
	};

	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);
}
