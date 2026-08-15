import type { IncomingMessage } from "node:http";
import type { Readable } from "node:stream";

/**
 * Wraps or extracts a Node.js Readable stream directly from an IncomingMessage or framework Request wrapper.
 */
export function reqStream(req: IncomingMessage): Readable {
	if (req.destroyed) {
		throw new Error(
			"[Subatom Stream Error]: Request stream has already been destroyed.",
		);
	}
	return req;
}
