import type { ServerResponse } from "node:http";

/**
 * Writes a chunk to the response and resolves once it's safe to write
 * again - immediately if the internal buffer has room, or after 'drain'
 * if backpressure kicked in. Use this for anything that pushes data over
 * time outside of a `pipeline()` call (e.g. SSE, manual chunked writes),
 * since a plain `raw.write()` loop can buffer unboundedly in memory when
 * the producer is faster than the client can consume.
 */
export function writeWithBackpressure(
	raw: ServerResponse,
	chunk: Buffer | string,
): Promise<void> {
	if (raw.writableEnded || raw.destroyed) {
		return Promise.reject(new Error("Cannot write: response already ended"));
	}
	return new Promise((resolve, reject) => {
		const onError = (err: Error) => reject(err);
		raw.once("error", onError);

		const ok = raw.write(chunk, (err) => {
			raw.off("error", onError);
			if (err) reject(err);
			else if (ok) resolve();
		});

		if (!ok) {
			raw.once("drain", () => {
				raw.off("error", onError);
				resolve();
			});
		}
	});
}
