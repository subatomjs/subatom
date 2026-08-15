import * as fs from "node:fs";
import type { Readable } from "node:stream";

export interface FileStreamOptions {
	start?: number;
	end?: number;
	highWaterMark?: number;
}

/**
 * Creates a readable file stream wrapper for given file location.
 */
export function fileStream(
	filePath: string,
	options?: FileStreamOptions,
): Readable {
	if (!fs.existsSync(filePath)) {
		throw new Error(
			`[Subatom File Stream Error]: Target path does not exist: ${filePath}`,
		);
	}
	return fs.createReadStream(filePath, options);
}
