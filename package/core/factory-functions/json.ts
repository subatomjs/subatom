// middleware/json.ts

import type { NextFunction } from "../../types/framework/pipeline/INext.js";
import type { ILimit } from "../../types/framework/pipeline/IPipeline.js";
import type { IRequest } from "../../types/http/IRequest.js";
import type { IResponse } from "../../types/http/IResponse.js";
import { parseLimit } from "../utils/parseLimit.js";

export function json(options: ILimit = {}) {
	const maxBytes = parseLimit(options.limit ?? "100kb"); // Default 100kb like Express

	return async (req: IRequest, res: IResponse, next: NextFunction) => {
		// 1. Only process requests with JSON content-type or requests that carry a body
		const contentType = req.raw.headers["content-type"] || "";
		const hasBody =
			req.raw.headers["content-length"] || req.raw.headers["transfer-encoding"];

		if (!hasBody || !contentType.includes("application/json")) {
			req.body = {};
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

			// 4. Parse aggregated buffer into JSON
			const rawBody = Buffer.concat(chunks).toString("utf-8");

			if (rawBody.trim().length > 0) {
				req.body = JSON.parse(rawBody);
			} else {
				req.body = {};
			}

			await next();
		} catch (error) {
			// 5. Catch invalid JSON syntax errors
			res.status(400).json({
				success: false,
				message: "Bad Request: Invalid JSON Payload",
			});
		}
	};
}
