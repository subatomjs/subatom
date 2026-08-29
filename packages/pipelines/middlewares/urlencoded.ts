/**
 * @fileoverview This module is responsible for parsing incoming URL-encoded form data
 * (application/x-www-form-urlencoded)
 * into a structured JavaScript object and attaching it to req.body.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import querystring from "node:querystring";
import type { ILimit } from "./types/middleware.types.js";
import type { NextFunction } from "../next/types/nextFunction.types.js";
import type { IRequest } from "../../core/http/request/types/request.types.js";
import type { IResponse } from "../../core/http/response/types/response.types.js";
import { parseLimit } from "./utils/limit/parseLimit.js";

export function urlencoded(options: ILimit = {}) {
	const maxBytes = parseLimit(options.limit ?? "100kb"); // Default 100kb limit

	return async (req: IRequest, res: IResponse, next: NextFunction) => {
		const contentType = req.raw.headers["content-type"] || "";
		const hasBody =
			req.raw.headers["content-length"] || req.raw.headers["transfer-encoding"];

		// 1. Only process application/x-www-form-urlencoded requests
		if (
			!hasBody ||
			!contentType.includes("application/x-www-form-urlencoded")
		) {
			return next();
		}

		// 2. Content-Length header guard check
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

		// 3. Aggregate request stream chunks and enforce size limits dynamically
		try {
			const chunks: Buffer[] = [];
			let totalBytes = 0;

			for await (const chunk of req.raw) {
				totalBytes += chunk.length;

				if (totalBytes > maxBytes) {
					res.status(413).json({
						success: false,
						message: "Payload Too Large",
					});
					return;
				}

				chunks.push(chunk);
			}

			// 4. Decode form string payload into a JavaScript Object
			const rawBody = Buffer.concat(chunks).toString("utf-8");

			if (rawBody.trim().length > 0) {
				// Parse "name=Kunal&roles=admin&roles=dev" into { name: 'Kunal', roles: ['admin', 'dev'] }
				const parsedQuery = querystring.parse(rawBody);

				// Attach parsed result onto req.body
				const existingBody =
					req.body && typeof req.body === "object" && !Array.isArray(req.body)
						? req.body
						: {};
				req.body = Object.assign({}, existingBody, parsedQuery);
			} else if (!req.body) {
				req.body = {};
			}

			await next();
		} catch (_error: unknown) {
			res.status(400).json({
				success: false,
				message: "Bad Request: Malformed URL-encoded payload",
			});
		}
	};
}
