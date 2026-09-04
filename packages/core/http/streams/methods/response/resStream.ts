/**
 * @fileoverview Pipes a readable stream into a ServerResponse with proper cleanup and error management.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ServerResponse } from "node:http";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import type { IStreamOptions } from "../../types/stream.methods.types.js";

export async function resStream(
	res: ServerResponse,
	readableStream: Readable,
	options: IStreamOptions = {},
): Promise<void> {
	if (res.writableEnded) {
		readableStream.destroy();
		return;
	}

	try {
		// pipeline() automatically pipes data, flushes, handles cleanup,
		// and safely finalizes res when the stream finishes.
		await pipeline(readableStream, res);
	} catch (err: unknown) {
		// Ignore Premature close if client disconnected intentionally
		if ((err as NodeJS.ErrnoException).code === "ERR_STREAM_PREMATURE_CLOSE") {
			return;
		}

		if (options.onError) {
			options.onError(err as NodeJS.ErrnoException);
		} else {
			console.error(
				"[Subatom Response Stream Error]:",
				(err as NodeJS.ErrnoException).message,
			);
			if (!res.headersSent) {
				res.statusCode = 500;
				res.setHeader("Content-Type", "application/json");
				res.end(JSON.stringify({ error: "Internal Server Error" }));
			} else if (!res.writableEnded) {
				res.destroy(err as NodeJS.ErrnoException);
			}
		}
	}
}
