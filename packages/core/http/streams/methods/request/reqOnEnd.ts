/**
 * @fileoverview Attaches an 'end' listener to the request stream.
 * Returns an unsubscription function.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IncomingMessage } from "node:http";
import type { TypeEndListener } from "../../types/stream.methods.types.js";

export function reqOnEnd(
	req: IncomingMessage,
	listener: TypeEndListener,
): () => void {
	req.once("end", listener);

	return (): void => {
		req.off("end", listener);
	};
}
