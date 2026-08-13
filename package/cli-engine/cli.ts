#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Move up to the project root where package.json lives
const packageJsonPath = path.resolve(__dirname, "../../../package.json");

const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

const program = new Command("subatom");
program.version(pkg.version, "-v, --version", "Print the current version");

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

program.parseAsync().catch((err) => {
	console.error(err instanceof Error ? err.message : err);
	process.exit(1);
});
