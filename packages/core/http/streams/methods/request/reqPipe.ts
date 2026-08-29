/**
 * @fileoverview Safely pipes the incoming HTTP request stream to a destination Writable stream.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IncomingMessage } from "node:http";
import type { Writable } from "node:stream";
import type { IPipeOptions } from "../../types/stream.methods.types.js";

export function reqPipe<T extends Writable>(
	req: IncomingMessage,
	destination: T,
	options?: IPipeOptions,
): T {
	if (req.destroyed) {
		throw new Error(
			"[Subatom Stream Error]: Cannot pipe a destroyed request stream.",
		);
	}
	return req.pipe(destination, options);
}
