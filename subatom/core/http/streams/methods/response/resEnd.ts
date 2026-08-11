import type { ServerResponse } from "node:http";

export type EndCallback = () => void;

/**
 * Safely signals the end of the HTTP response stream.
 */
export function resEnd(
    res: ServerResponse,
    chunk?: string | Buffer | Uint8Array,
    encoding?: BufferEncoding,
    callback?: EndCallback
): void {
    if (res.writableEnded || res.finished) {
        return;
    }

    if (typeof chunk === "function") {
        callback = chunk as EndCallback;
        chunk = undefined;
        encoding = undefined;
    } else if (typeof encoding === "function") {
        callback = encoding as unknown as EndCallback;
        encoding = undefined;
    }

    res.end(chunk, encoding || "utf-8", callback);
}