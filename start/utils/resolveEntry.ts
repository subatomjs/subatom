/**
 * @fileoverview Responsible for resolving the user-configured entry file.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { existsSync, statSync } from "node:fs";
import path from "node:path";

export class EntryNotFoundError extends Error {
	constructor(entryPath: string, fullPath: string) {
		super(
			`[Subatom] Entry file "${entryPath}" does not exist at "${fullPath}". Please verify your "entry" setting in subatom.config.js.`,
		);
		this.name = "EntryNotFoundError";
	}
}

export function resolveEntry(
	entry: string | undefined,
	cwd: string = process.cwd(),
): string {
	if (!entry || typeof entry !== "string" || entry.trim() === "") {
		throw new Error(
			`[Subatom] Invalid entry: Expected a non-empty string path, received "${entry}". Please specify "entry" in subatom.config.js.`,
		);
	}

	const absolutePath = path.isAbsolute(entry)
		? entry
		: path.resolve(cwd, entry);

	if (!existsSync(absolutePath)) {
		throw new EntryNotFoundError(entry, absolutePath);
	}

	const stat = statSync(absolutePath);
	if (stat.isDirectory()) {
		throw new Error(
			`[Subatom] Entry "${entry}" resolved to a directory ("${absolutePath}"). It must point directly to a file.`,
		);
	}

	return absolutePath;
}
