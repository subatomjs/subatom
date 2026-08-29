/**
 * @fileoverview Extracts and validates file upload metadata from handler configuration,
 * returning valid metadata for OpenAPI generation and ignoring malformed configs.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { FileMetadata } from "./types/openapi.types.js";

type Callable = (...args: unknown[]) => unknown;

type FunctionWithFileConfig = Callable & {
	_fileConfig?: unknown;
};

export function extractFileMetadata(handler: unknown): FileMetadata | null {
	if (typeof handler !== "function") {
		return null;
	}

	const candidate = handler as FunctionWithFileConfig;
	if (!candidate._fileConfig) {
		return null;
	}

	const config = candidate._fileConfig as FileMetadata;

	// Defensive validation — a malformed _fileConfig should not silently
	// produce a broken/misleading OpenAPI schema.
	if (
		config &&
		(config.type === "single" ||
			config.type === "array" ||
			config.type === "fields")
	) {
		return config;
	}

	console.warn(
		"[subatom:docs] Handler has a _fileConfig property but it does not " +
			'match the expected shape ({ type: "single"|"array"|"fields", ... }). ' +
			"Ignoring it for OpenAPI generation. Handler:",
		candidate.name || "anonymous",
	);

	return null;
}
