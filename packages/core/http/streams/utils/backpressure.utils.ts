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
		let settled = false;
		let waitingForDrain = false;

		const cleanup = () => {
			raw.off("error", onError);
			raw.off("drain", onDrain);
			raw.off("close", onClose);
			raw.off("aborted", onAborted);
		};
		const settle = (error?: Error) => {
			if (settled) return;
			settled = true;
			cleanup();
			if (error) reject(error);
			else resolve();
		};
		const onError = (err: Error) => settle(err);
		const onDrain = () => {
			if (waitingForDrain) settle();
		};
		const onClose = () => {
			if (!raw.writableEnded) {
				settle(new Error("Response closed before the write completed"));
			}
		};
		const onAborted = () =>
			settle(new Error("Response aborted before the write completed"));

		raw.once("error", onError);
		raw.once("close", onClose);
		raw.once("aborted", onAborted);

		let ok: boolean;
		try {
			ok = raw.write(chunk, (err) => {
				if (err) settle(err);
				else if (!waitingForDrain) settle();
			});
		} catch (error) {
			settle(error instanceof Error ? error : new Error(String(error)));
			return;
		}

		if (!ok && !settled) {
			waitingForDrain = true;
			raw.once("drain", onDrain);
		} else if (!settled) {
			settle();
		}
	});
}
