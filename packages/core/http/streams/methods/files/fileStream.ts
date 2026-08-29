/**
 * @fileoverview Creates a readable file stream wrapper for given file location.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import * as fs from "node:fs";
import type { Readable } from "node:stream";
import type { FileStreamOptions } from "../../types/stream.methods.types.js";

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
