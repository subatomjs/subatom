import { existsSync } from "node:fs";
import path from "node:path";
import { findAndLoadConfig } from "../../config/load.config.js";
import { logger } from "../utils/logger.js";
import { resolvePort } from "../utils/port.js";
import { runProcess } from "../utils/spawnProcess.js";

interface StartOptions {
	port?: string;
	host?: string;
}

export async function runStart(opts: StartOptions): Promise<void> {
	const cwd = process.cwd();
	const config = await findAndLoadConfig(cwd);

	const outDir = path.resolve(cwd, config.outDir);
	const entryBase = path.basename(config.entry).replace(/\.tsx?$/, ".js");
	const compiledEntry = path.join(outDir, entryBase);

	if (!existsSync(compiledEntry)) {
		logger.error(`No build found at ${path.relative(cwd, compiledEntry)}`);
		logger.info(`Run "subatom build" first.`);
		process.exit(1);
	}

	const host = opts.host ?? config.host;
	const preferredPort = opts.port ? Number(opts.port) : config.port;

	if (Number.isNaN(preferredPort)) {
		logger.error(`Invalid port: "${opts.port}"`);
		process.exit(1);
	}

	const port = await resolvePort(preferredPort, host);

	logger.success(
		`Starting production server on http://${host === "0.0.0.0" ? "localhost" : host}:${port}`,
	);

	runProcess(process.execPath, [compiledEntry], {
		cwd,
		label: "production server",
		env: {
			NODE_ENV: "production",
			PORT: String(port),
			HOST: host,
		},
	});
}
