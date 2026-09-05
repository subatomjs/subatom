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
import { isPayloadTooLarge, readLimitedBody } from "./utils/readLimitedBody.js";

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

		try {
			req.body = (await readLimitedBody(req.raw, maxBytes)).toString(encoding);

			await next();
		} catch (error: unknown) {
			res.status(isPayloadTooLarge(error) ? 413 : 400).json({
				success: false,
				message: isPayloadTooLarge(error)
					? "Payload Too Large"
					: "Bad Request: Error reading text payload",
			});
		}
	};
}
