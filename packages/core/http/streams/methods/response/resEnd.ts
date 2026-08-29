/**
 * @fileoverview Safely signals the end of the HTTP response stream.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ServerResponse } from "node:http";
import type { TypeResEndCallback } from "../../types/stream.methods.types.js";

export function resEnd(
	res: ServerResponse,
	chunk?: string | Buffer | Uint8Array,
	encoding?: BufferEncoding,
	callback?: TypeResEndCallback,
): void {
	if (res.writableEnded || res.finished) {
		return;
	}

	if (typeof chunk === "function") {
		callback = chunk as TypeResEndCallback;
		chunk = undefined;
		encoding = undefined;
	} else if (typeof encoding === "function") {
		callback = encoding as unknown as TypeResEndCallback;
		encoding = undefined;
	}

	res.end(chunk, encoding || "utf-8", callback);
}
