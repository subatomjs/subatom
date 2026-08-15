import type { IncomingMessage } from "node:http";
import type { Writable } from "node:stream";

export interface PipeOptions {
	end?: boolean;
}

/**
 * Safely pipes the incoming HTTP request stream to a destination Writable stream.
 */
export function reqPipe<T extends Writable>(
	req: IncomingMessage,
	destination: T,
	options?: PipeOptions,
): T {
	if (req.destroyed) {
		throw new Error(
			"[Subatom Stream Error]: Cannot pipe a destroyed request stream.",
		);
	}
	return req.pipe(destination, options);
}
