/**
 * @fileoverview Responsible for validate config.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { ConfigError } from "../ConfigError.js";
import type { SubatomConfig } from "../types/index.types.js";

export function validateConfig(config: SubatomConfig): void {
	if (
		typeof config.port !== "number" ||
		Number.isNaN(config.port) ||
		config.port < 1 ||
		config.port > 65535
	) {
		throw new ConfigError("port", "a valid port number (1-65535)", config.port);
	}
	if (typeof config.host !== "string" || config.host.trim() === "") {
		throw new ConfigError("host", "a non-empty string", config.host);
	}
	if (typeof config.entry !== "string" || config.entry.trim() === "") {
		throw new ConfigError(
			"entry",
			"a non-empty file path string",
			config.entry,
		);
	}

	// Strictly assert entry file existence
	const resolvedEntry = path.resolve(process.cwd(), config.entry);
	if (!existsSync(resolvedEntry)) {
		throw new Error(
			`[Subatom Config Error]: Entry file "${config.entry}" does not exist at "${resolvedEntry}".`,
		);
	}
	if (statSync(resolvedEntry).isDirectory()) {
		throw new Error(
			`[Subatom Config Error]: Entry "${config.entry}" is a directory. It must point directly to a file.`,
		);
	}

	if (typeof config.outDir !== "string" || config.outDir.trim() === "") {
		throw new ConfigError(
			"outDir",
			"a non-empty directory path string",
			config.outDir,
		);
	}
	if (typeof config.sourcemap !== "boolean") {
		throw new ConfigError("sourcemap", "a boolean", config.sourcemap);
	}
	if (typeof config.minify !== "boolean") {
		throw new ConfigError("minify", "a boolean", config.minify);
	}
	if (
		config.watch &&
		(!Array.isArray(config.watch.extensions) ||
			!Array.isArray(config.watch.ignore))
	) {
		throw new ConfigError(
			"watch",
			"an object containing arrays for extensions and ignore",
			config.watch,
		);
	}
}
