#!/usr/bin/env node

/**
 * @fileoverview responsible to manage command line interface.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PackageJson {
	version: string;
}

/**
 * Find package.json by walking upward from the current file.
 *
 * This works whether the CLI is executed from:
 * - package/
 * - dist/
 * - a nested directory
 */
function getPackageJson(): PackageJson {
	let currentDir = __dirname;

	while (true) {
		const pkgPath = path.join(currentDir, "package.json");

		if (existsSync(pkgPath)) {
			try {
				const pkg = JSON.parse(
					readFileSync(pkgPath, "utf-8"),
				) as Partial<PackageJson>;

				if (typeof pkg.version === "string") {
					return {
						version: pkg.version,
					};
				}
			} catch {
				// Continue searching parent directories.
			}
		}

		const parentDir = path.dirname(currentDir);

		if (parentDir === currentDir) {
			break;
		}

		currentDir = parentDir;
	}

	throw new Error("Could not find package.json");
}

const pkg = getPackageJson();

const program = new Command();

program
	.name("subatom")
	.version(pkg.version, "-v, --version", "Print the current version");

program
	.command("dev")
	.description("Start the subatom dev server")
	.option("-p, --port <port>", "Port to run on")
	.option("-H, --host <host>", "Host to bind to")
	.action(async (opts) => {
		const { runDev } = await import("./commands/dev.js");
		await runDev(opts);
	});

program
	.command("build")
	.description("Build the app for production")
	.action(async () => {
		const { runBuild } = await import("./commands/build.js");
		await runBuild();
	});

program
	.command("start")
	.description("Run the production build")
	.option("-p, --port <port>", "Port to run on")
	.option("-H, --host <host>", "Host to bind to")
	.action(async (opts) => {
		const { runStart } = await import("./commands/start.js");
		await runStart(opts);
	});

program
	.command("preview")
	.description("Preview the production build locally")
	.action(async () => {
		const { runPreview } = await import("./commands/preview.js");
		await runPreview();
	});

program.parseAsync(process.argv).catch((err: unknown) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
