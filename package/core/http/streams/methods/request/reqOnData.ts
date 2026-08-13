import type { IncomingMessage } from "node:http";

export type DataListener = (chunk: Buffer) => void;

/**
 * Attaches a 'data' listener to the request stream with error handling and cleanup options.
 * Returns an unsubscription function to remove the listener.
 */
export function reqOnData(
    req: IncomingMessage,
    listener: DataListener
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