import type { ServerResponse } from "node:http";

export type WriteCallback = (error?: Error | null) => void;

/**
 * Writes a chunk to the response stream directly, ensuring valid state.
 */
export function resWrite(
	res: ServerResponse,
	chunk: string | Buffer | Uint8Array,
	encoding?: BufferEncoding,
	callback?: WriteCallback,
): boolean {
	if (res.writableEnded || res.finished) {
		if (callback)
			callback(
				new Error(
					"[Subatom Stream Error]: Cannot write to closed response stream.",
				),
			);
		return false;
	}

	if (typeof encoding === "function") {
		callback = encoding;
		encoding = "utf-8";
	}

	return res.write(chunk, encoding || "utf-8", callback);
}
