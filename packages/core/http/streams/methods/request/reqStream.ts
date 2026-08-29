/**
 * @fileoverview Wraps or extracts a Node.js Readable stream directly from an IncomingMessage or framework Request wrapper.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IncomingMessage } from "node:http";
import type { Readable } from "node:stream";

export function reqStream(req: IncomingMessage): Readable {
	if (req.destroyed) {
		throw new Error(
			"[Subatom Stream Error]: Request stream has already been destroyed.",
		);
	}
	return req;
}
