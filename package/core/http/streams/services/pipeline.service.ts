import type { ServerResponse } from "node:http";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { StreamPipeOptions } from "../../../../types/http/IStream.js";
import { StreamAbortedError } from "../../../../types/http/IStream.js";
import { bindAbortSignal, onClientDisconnect } from "../utils/abort.utils.js";

/**
 * Pipes a Readable (or the tail of a Transform chain built with
 * `composePipeline`) into the response via `node:stream/promises`
 * `pipeline`, which - unlike plain `.pipe()` - guarantees every stream in
 * the chain is destroyed on error or premature close. That avoids the
 * classic footguns of manual piping: unhandled 'error' events, leaked
 * file descriptors/sockets, and orphaned upstream sources still writing
 * into a torn-down chain.
 *
 * Client disconnects and `options.signal` are both wired to abort the
 * pipeline early rather than let it keep pulling from a source nobody's
 * listening to anymore.
 */
export async function pipeToResponse(
	raw: ServerResponse,
	source: Readable,
	options: StreamPipeOptions = {},
): Promise<void> {
	const {
		signal,
		onError,
		onFinish,
		onClientDisconnect: onDisconnect,
	} = options;

	const controller = new AbortController();
	const unbindSignal = bindAbortSignal(signal, () => controller.abort());
	const unbindDisconnect = onClientDisconnect(raw, () => {
		onDisconnect?.();
		controller.abort();
	});

	try {
		await pipeline(source, raw, { signal: controller.signal });
		onFinish?.();
	} catch (error) {
		const err = error as NodeJS.ErrnoException & { name: string };
		const wasCancelled =
			err.name === "AbortError" || err.code === "ERR_STREAM_PREMATURE_CLOSE";

		if (wasCancelled) {
			onError?.(new StreamAbortedError());
			// Not rethrown: cancellation is an expected outcome, not a bug for
			// the caller to handle as a 500.
			return;
		}

		onError?.(err);
		if (!raw.headersSent) {
			// Headers not sent yet - safe to let the caller catch this and
			// respond with a proper error status instead of a half-open stream.
			throw err;
		}
		// Headers already sent: nothing left to do but ensure the socket
		// doesn't hang open.
		if (!raw.writableEnded) raw.destroy(err);
	} finally {
		unbindSignal();
		unbindDisconnect();
	}
}

/**
 * Chains Transform streams after a source, wiring `pipeline`'s
 * destroy-on-error semantics across the whole chain (rather than each
 * `.pipe()` needing its own error handler). Returns the final stream to
 * hand to `pipeToResponse`.
 *
 * Note: this returns a stream, it does not itself start flowing -
 * `pipeToResponse` (or another consumer) drives it.
 */
export function composePipeline(
	source: Readable,
	...transforms: NodeJS.ReadWriteStream[]
): Readable {
	if (transforms.length === 0) return source;
	let current: Readable = source;
	for (const transform of transforms) {
		current = current.pipe(transform as any);
		// Surface upstream errors on the downstream stream too, so a single
		// `pipeline()` call at the end still catches failures anywhere in
		// the chain instead of only at the tail.
		current.on("error", (err) => {
			if (!(transform as any).destroyed) (transform as any).destroy(err);
		});
	}
	return current as unknown as Readable;
}
