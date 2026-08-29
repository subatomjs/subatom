/**
 * @fileoverview This module is responsible for parsing incoming plain text HTTP
 *  request bodies into strings and attaching the resulting text to req.body.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ITextOptions } from "./types/middleware.types.js";
import type { NextFunction } from "../next/types/nextFunction.types.js";
import type { IRequest } from "../../core/http/request/types/request.types.js";
import type { IResponse } from "../../core/http/response/types/response.types.js";
import { parseLimit } from "./utils/limit/parseLimit.js";

export function text(options: ITextOptions = {}) {
	const maxBytes = parseLimit(options.limit ?? "100kb");
	const acceptedType = options.type ?? "text/plain";
	const encoding = options.defaultEncoding ?? "utf-8";

	return async (req: IRequest, res: IResponse, next: NextFunction) => {
		// 1. Only process requests with matching content-type or requests that carry a body
		const contentType = req.raw.headers["content-type"] || "";
		const hasBody =
			req.raw.headers["content-length"] || req.raw.headers["transfer-encoding"];

		const matchesType = Array.isArray(acceptedType)
			? acceptedType.some((type) => contentType.includes(type))
			: contentType.includes(acceptedType);

		if (!hasBody || !matchesType) {
			req.body = "";
			return next();
		}

		// 2. Early Content-Length check if the header is provided
		const contentLength = parseInt(
			req.raw.headers["content-length"] || "0",
			10,
		);
		if (contentLength > maxBytes) {
			res.status(413).json({
				success: false,
				message: "Payload Too Large",
			});
			return;
		}

		// 3. Stream data buffer aggregation with real-time size tracking
		try {
			const chunks: Buffer[] = [];
			let totalBytes = 0;

			for await (const chunk of req.raw) {
				totalBytes += chunk.length;

				// Enforce byte limit during chunk streaming
				if (totalBytes > maxBytes) {
					res.status(413).json({
						success: false,
						message: "Payload Too Large",
					});
					return;
				}

				chunks.push(chunk);
			}

			// 4. Convert aggregated buffer to text string
			req.body = Buffer.concat(chunks).toString(encoding);

			await next();
		} catch (_error: unknown) {
			// 5. Catch stream read or encoding errors
			res.status(400).json({
				success: false,
				message: "Bad Request: Error reading text payload",
			});
		}
	};
}
