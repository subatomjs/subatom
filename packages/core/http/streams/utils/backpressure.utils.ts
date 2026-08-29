/**
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */
/**
 * Writes a chunk to the response and resolves once it's safe to write
 * again - immediately if the internal buffer has room, or after 'drain'
 * if backpressure kicked in. Use this for anything that pushes data over
 * time outside of a `pipeline()` call (e.g. SSE, manual chunked writes),
 * since a plain `raw.write()` loop can buffer unboundedly in memory when
 * the producer is faster than the client can consume.
 */
import type { ServerResponse } from "node:http";

export function writeWithBackpressure(
	raw: ServerResponse,
	chunk: Buffer | string,
): Promise<void> {
	if (raw.writableEnded || raw.destroyed) {
		return Promise.reject(new Error("Cannot write: response already ended"));
	}
	return new Promise((resolve, reject) => {
		let callbackExecuted = false;

		const onError = (err: Error) => reject(err);
		raw.once("error", onError);

		const ok = raw.write(chunk, (err) => {
			raw.off("error", onError);
			callbackExecuted = true;
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});

		if (!ok && !callbackExecuted) {
			raw.once("drain", () => {
				raw.off("error", onError);
				resolve();
			});
		}
	});
}
