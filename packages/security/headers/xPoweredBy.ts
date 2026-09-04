/**
 * @fileoverview Controls the X-Powered-By header, allowing it to be removed or
 * set to a custom value for reduced technology exposure.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IRequest } from "../../core/http/request/types/request.types.js";
import type { IResponse } from "../../core/http/response/types/response.types.js";
import type { NextFunction } from "../../pipelines/next/types/nextFunction.types.js";
import { SECURITY_HEADERS } from "../security.constant.header.js";
import { removeSecurityHeader, setSecurityHeader } from "../security.utils.js";

export function createXPoweredByMiddleware(value: boolean | string = false) {
	return (_req: IRequest, res: IResponse, next: NextFunction) => {
		if (value === false) {
			removeSecurityHeader(res, SECURITY_HEADERS.X_POWERED_BY);
		} else if (typeof value === "string") {
			setSecurityHeader(res, SECURITY_HEADERS.X_POWERED_BY, value);
		}
		next();
	};
}
