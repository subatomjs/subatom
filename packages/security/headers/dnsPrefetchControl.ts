/**
 * @fileoverview Adds DNS Prefetch Control middleware,
 * setting the X-DNS-Prefetch-Control header to enable or disable browser DNS prefetching.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IRequest } from "../../core/http/request/types/request.types.js";
import type { IResponse } from "../../core/http/response/types/response.types.js";
import type { NextFunction } from "../../pipelines/next/types/nextFunction.types.js";
import { SECURITY_HEADERS } from "../security.constant.header.js";
import { setSecurityHeader } from "../security.utils.js";

export function createDNSPrefetchControlMiddleware(
	options?: { allow?: boolean } | boolean,
) {
	const allow =
		typeof options === "boolean" ? options : (options?.allow ?? false);

	return (_req: IRequest, res: IResponse, next: NextFunction) => {
		setSecurityHeader(
			res,
			SECURITY_HEADERS.X_DNS_PREFETCH_CONTROL,
			allow ? "on" : "off",
		);
		next();
	};
}
