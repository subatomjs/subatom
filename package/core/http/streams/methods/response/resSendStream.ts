import type { ServerResponse } from "node:http";
import type { Readable } from "node:stream";

export interface SendStreamOptions {
    contentType?: string;
    contentLength?: number;
    statusCode?: number;
}

/**
 * Higher-level helper setting headers before piping a readable stream to the response.
 */
export function resSendStream(
    res: ServerResponse,
    readableStream: Readable,
    options: SendStreamOptions = {}
): void {
    if (res.headersSent) {
        throw new Error("[Subatom Stream Error]: Headers already sent before resSendStream invocation.");
    }

    res.statusCode = options.statusCode ?? 200;

    if (options.contentType) {
        res.setHeader("Content-Type", options.contentType);
    }
    if (options.contentLength !== undefined) {
        res.setHeader("Content-Length", options.contentLength.toString());
    }

    readableStream.once("error", (err: Error) => {
        if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Stream transmission failed." }));
        } else {
            res.destroy(err);
        }
    });

    readableStream.pipe(res);
}