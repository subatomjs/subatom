import type { ServerResponse } from "node:http";
import type { Readable } from "node:stream";
import type { StreamPipeOptions } from "../../../../types/http/IStream.js";
import { pipeToResponse } from "./pipeline.service.js";

export interface StreamResponseOptions extends StreamPipeOptions {
	status?: number;
	contentType?: string;
	/** Set only when known ahead of time (e.g. from a file stat). Omit for chunked transfer. */
	contentLength?: number;
	headers?: Record<string, string>;
}

/**
 * Sends a Readable as the full response body. This is the general-purpose
 * entry point behind `res.stream()` - for the file-specific variant with
 * Range support, use `streamFileToResponse` instead.
 */
export async function streamResponse(
	raw: ServerResponse,
	source: Readable,
	options: StreamResponseOptions = {},
): Promise<void> {
	if (!raw.headersSent) {
		raw.statusCode = options.status ?? raw.statusCode ?? 200;
		if (options.contentType) raw.setHeader("Content-Type", options.contentType);
		if (options.contentLength !== undefined) {
			raw.setHeader("Content-Length", options.contentLength);
		}
		if (options.headers) {
			for (const [key, value] of Object.entries(options.headers)) {
				raw.setHeader(key, value);
			}
		}
	}
	await pipeToResponse(raw, source, options);
}
