/**
 * @fileoverview This module is responsible for parsing incoming JSON HTTP request
 * bodies into JavaScript objects and attaching the result to req.body.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { NextFunction } from "../next/types/nextFunction.types.js";
import type { IRequest } from "../../core/http/request/types/request.types.js";
import type { IResponse } from "../../core/http/response/types/response.types.js";
import { parseLimit } from "./utils/limit/parseLimit.js";
import { isPayloadTooLarge, readLimitedBody } from "./utils/readLimitedBody.js";
import type { ILimit } from "./types/middleware.types.js";

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

		try {
			const rawBody = (await readLimitedBody(req.raw, maxBytes)).toString(
				"utf-8",
			);

			if (rawBody.trim().length > 0) {
				req.body = JSON.parse(rawBody);
			} else {
				req.body = {};
			}

			await next();
		} catch (error: unknown) {
			res.status(isPayloadTooLarge(error) ? 413 : 400).json({
				success: false,
				message: isPayloadTooLarge(error)
					? "Payload Too Large"
					: "Bad Request: Invalid JSON Payload",
			});
		}
	};
}
