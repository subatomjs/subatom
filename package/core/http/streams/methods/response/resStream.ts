import type { ServerResponse } from "node:http";
import type { Readable } from "node:stream";

export interface StreamOptions {
	onError?: (err: Error) => void;
}

/**
 * Pipes a readable stream into a ServerResponse with proper cleanup and error management.
 */
export function resStream(
	res: ServerResponse,
	readableStream: Readable,
	options: StreamOptions = {},
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
