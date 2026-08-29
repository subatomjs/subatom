/**
 * @fileoverview Writes a chunk to the response stream directly, ensuring valid state.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ServerResponse } from "node:http";
import type { TypeResWriteCallback } from "../../types/stream.methods.types.js";

export function resWrite(
	res: ServerResponse,
	chunk: string | Buffer | Uint8Array,
	encoding?: BufferEncoding,
	callback?: TypeResWriteCallback,
): boolean {
	if (res.writableEnded || res.writableFinished) {
		if (callback)
			callback(
				new Error(
					"[Subatom Stream Error]: Cannot write to closed response stream.",
				),
			);
		return false;
	}

	if (typeof encoding === "function") {
		callback = encoding;
		encoding = "utf-8";
	}

	return res.write(chunk, encoding || "utf-8", callback);
}
