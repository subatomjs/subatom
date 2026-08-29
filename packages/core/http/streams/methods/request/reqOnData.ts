/**
 * @fileoverview Attaches a 'data' listener to the request stream with error handling and cleanup options.
 * Returns an unsubscription function to remove the listener.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IncomingMessage } from "node:http";
import type { TypeDataListener } from "../../types/stream.methods.types.js";

export function reqOnData(
	req: IncomingMessage,
	listener: TypeDataListener,
): () => void {
	const wrappedListener = (chunk: unknown): void => {
		const bufferChunk = Buffer.isBuffer(chunk)
			? chunk
			: Buffer.from(chunk as string | Uint8Array);
		listener(bufferChunk);
	};

	req.on("data", wrappedListener);

	return (): void => {
		req.off("data", wrappedListener);
	};
}
