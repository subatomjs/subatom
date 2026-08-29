/**
 * @fileoverview Pipes a readable stream into a ServerResponse with proper cleanup and error management.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ServerResponse } from "node:http";
import type { Readable } from "node:stream";
import type { IStreamOptions } from "../../types/stream.methods.types.js";

export function resStream(
	res: ServerResponse,
	readableStream: Readable,
	options: IStreamOptions = {},
): void {
	if (res.writableEnded) {
		readableStream.destroy();
		return;
	}

	const errorHandler = (err: Error): void => {
		if (options.onError) {
			options.onError(err);
		} else {
			console.error("[Subatom Response Stream Error]:", err.message);
			if (!res.headersSent) {
				res.statusCode = 500;
				res.setHeader("Content-Type", "application/json");
				res.end(JSON.stringify({ error: "Internal Server Error" }));
			} else {
				res.destroy(err);
			}
		}
	};

	readableStream.once("error", errorHandler);
	readableStream.pipe(res);
}
