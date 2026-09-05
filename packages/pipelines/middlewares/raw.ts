/**
 * @fileoverview This module is responsible for parsing incoming binary/raw
 * HTTP request payloads into a Node.js Buffer and attaching it directly to req.body.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { NextFunction } from "../next/types/nextFunction.types.js";
import type { IRequest } from "../../core/http/request/types/request.types.js";
import type { IResponse } from "../../core/http/response/types/response.types.js";
import { parseLimit } from "./utils/limit/parseLimit.js";
import { isPayloadTooLarge, readLimitedBody } from "./utils/readLimitedBody.js";
import type { IRawOptions } from "./types/middleware.types.js";

export function raw(options: IRawOptions = {}) {
	const maxBytes = parseLimit(options.limit ?? "100kb");
	const acceptedType = options.type ?? "application/octet-stream";

	return async (req: IRequest, res: IResponse, next: NextFunction) => {
		// 1. Only process requests with matching content-type or requests that carry a body
		const contentType = req.raw.headers["content-type"] || "";
		const hasBody =
			req.raw.headers["content-length"] || req.raw.headers["transfer-encoding"];

		const matchesType = Array.isArray(acceptedType)
			? acceptedType.some((type) => contentType.includes(type))
			: contentType.includes(acceptedType);

		if (!hasBody || !matchesType) {
			req.body = Buffer.alloc(0);
			return next();
		}

		try {
			req.body = await readLimitedBody(req.raw, maxBytes);

			await next();
		} catch (error: unknown) {
			res.status(isPayloadTooLarge(error) ? 413 : 400).json({
				success: false,
				message: isPayloadTooLarge(error)
					? "Payload Too Large"
					: "Bad Request: Error reading raw payload",
			});
		}
	};
}
