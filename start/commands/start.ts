/**
 * @fileoverview The start.ts will start the server after build.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { findAndLoadConfig } from "../../config/helpers/load.config.js";
import { logger } from "../utils/logger.js";
import { resolvePort } from "../utils/port.js";
import { runProcess } from "../utils/spawnProcess.js";
import { resolveEntry } from "../utils/resolveEntry.js";

interface StartOptions {
	readonly port?: string;
	readonly host?: string;
}

function resolveCompiledEntry(
	cwd: string,
	entryFile: string,
	outDir: string,
): string {
	const relativeToCwd = path.relative(cwd, entryFile);
	const firstSegment = relativeToCwd.split(path.sep)[0] ?? ".";

	const sourceRoot =
		path.dirname(relativeToCwd) === "" ? cwd : path.resolve(cwd, firstSegment);

	const relativeEntry = path.relative(sourceRoot, entryFile);

	const compiledRelativeEntry = relativeEntry.replace(
		/\.(tsx?|mts|cts|jsx?|mjs|cjs)$/,
		".js",
	);

	return path.resolve(cwd, outDir, compiledRelativeEntry);
}

function formatServerUrl(host: string, port: number): string {
	const displayHost =
		host === "0.0.0.0" || host === "::" || host === "::0" ? "localhost" : host;

	const formattedHost =
		displayHost.includes(":") && !displayHost.startsWith("[")
			? `[${displayHost}]`
			: displayHost;

	return `http://${formattedHost}:${port}`;
}

export async function runStart(opts: StartOptions): Promise<void> {
	const cwd = process.cwd();
	const config = await findAndLoadConfig(cwd);

	let entryFile: string;
	try {
		entryFile = resolveEntry(config.entry, cwd);
	} catch (err: unknown) {
		logger.error(err instanceof Error ? err.message : String(err));
		process.exit(1);
	}

	const outDir = config.outDir ?? "dist";
	const compiledEntry = resolveCompiledEntry(cwd, entryFile, outDir);

	if (!existsSync(compiledEntry)) {
		logger.error(
			`No production build found at ${path.relative(cwd, compiledEntry)}`,
		);
		logger.info(`Run "subatom build" first.`);
		process.exit(1);
	}

	const host = opts.host ?? config.host ?? "localhost";
	const preferredPort = opts.port ? Number(opts.port) : (config.port ?? 8080);

	if (
		!Number.isInteger(preferredPort) ||
		preferredPort < 0 ||
		preferredPort > 65535
	) {
		logger.error(`Invalid port: "${opts.port ?? preferredPort}"`);
		process.exit(1);
	}

	const port = await resolvePort(preferredPort, host);
	const serverUrl = formatServerUrl(host, port);

	logger.success(`Starting production server on ${serverUrl}`);

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
