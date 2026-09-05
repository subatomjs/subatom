/**
 * @fileoverview Streaming request body middleware for large payloads.
 * Avoids buffering by providing direct stream access.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { Readable } from "node:stream";
import type { NextFunction } from "../next/types/nextFunction.types.js";
import type { IRequest } from "../../core/http/request/types/request.types.js";
import type { IResponse } from "../../core/http/response/types/response.types.js";

export interface IStreamingOptions {
	/**
	 * Maximum chunk size in bytes for streaming.
	 * @default 64 * 1024
	 */
	chunkSizeKb?: number;

	/**
	 * Content-Type patterns to stream.
	 * @default ["application/octet-stream", "video/", "audio/"]
	 */
	acceptTypes?: string[];

	/**
	 * Error handler for stream errors.
	 */
	onStreamError?: (error: Error, req: IRequest, res: IResponse) => void;
}

declare module "../../core/http/request/types/request.types.js" {
	interface IRequest {
		/**
		 * Raw readable stream for the request body.
		 * Only available when using the streaming() middleware.
		 */
		bodyStream?: Readable;
	}
}

/**
 * Streaming body middleware for large payloads.
 * Avoids buffering by attaching the raw stream to req.bodyStream.
 * Use this for file uploads, video streams, or large JSON payloads.
 *
 * @example
 * app.post("/upload", streaming(), (req, res) => {
 *   const stream = req.bodyStream;
 *   stream.pipe(fs.createWriteStream("file.bin"));
 * });
 */
export function streaming(options: IStreamingOptions = {}) {
	const _chunkSizeKb = options.chunkSizeKb ?? 64;
	const acceptTypes = options.acceptTypes ?? [
		"application/octet-stream",
		"video/",
		"audio/",
		"multipart/",
	];

	return async (
		req: IRequest,
		res: IResponse,
		next: NextFunction,
	): Promise<void> => {
		const contentType = req.raw.headers["content-type"] ?? "";
		const shouldStream = acceptTypes.some((pattern) =>
			contentType.includes(pattern),
		);

		if (!shouldStream) {
			return next();
		}

		req.bodyStream = req.raw;
		req.raw.setMaxListeners(10);

		req.raw.on("error", (error: Error) => {
			if (options.onStreamError) {
				options.onStreamError(error, req, res);
			} else {
				console.error("[streaming] stream error:", error);
				if (!res.headersSent) {
					res.status(400).json({
						success: false,
						message: "Stream read error",
					});
				}
			}
		});

		await next();
	};
}
