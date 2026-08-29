/**
 * @fileoverview responsible for find and resolve entry.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { logger } from "./logger.js";

const FALLBACK_CANDIDATES = [
	"src/index.ts",
	"src/index.js",
	"src/server.ts",
	"src/server.js",
	"index.ts",
	"index.js",
	"main.ts",
	"main.js",
];

// Error fallback
export class EntryNotFoundError extends Error {
	constructor(searched: string[]) {
		super(
			`Could not find an entry file. Searched:\n` +
				searched.map((p) => `  - ${p}`).join("\n") +
				`\n\nSet "entry" in subatom.config.ts or create one of the files above.`,
		);
		this.name = "EntryNotFoundError";
	}
}

export function resolveEntry(
	configuredEntry: string,
	cwd: string = process.cwd(),
): string {
	const candidates = [configuredEntry, ...FALLBACK_CANDIDATES];
	const seen = new Set<string>();

	for (const candidate of candidates) {
		const abs = path.resolve(cwd, candidate);
		if (seen.has(abs)) continue;
		seen.add(abs);
		if (existsSync(abs)) {
			if (candidate !== configuredEntry) {
				logger.warn(
					`Configured entry not found, using detected entry: ${candidate}`,
				);
			}
			return abs;
		}
	}

	throw new EntryNotFoundError(candidates.map((c) => path.resolve(cwd, c)));
}
