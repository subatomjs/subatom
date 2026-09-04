/**
 * @fileoverview Adds HSTS middleware, enforcing HTTPS via Strict-Transport-Security
 * with configurable max-age, subdomains, and preload options.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IRequest } from "../../core/http/request/types/request.types.js";
import type { IResponse } from "../../core/http/response/types/response.types.js";
import type { NextFunction } from "../../pipelines/next/types/nextFunction.types.js";
import { SECURITY_HEADERS } from "../security.constant.header.js";
import {
	normalizeSecurityConfig,
	setSecurityHeader,
} from "../security.utils.js";
import { defaultHSTSConfig, type HSTSConfig } from "../types/header.types.js";

export function createHSTSMiddleware(options?: Partial<HSTSConfig> | boolean) {
	const config = normalizeSecurityConfig(defaultHSTSConfig, options);
	if (!config)
		return (_req: IRequest, _res: IResponse, next: NextFunction) => next();

	let headerValue = `max-age=${config.maxAge}`;
	if (config.includeSubDomains) headerValue += "; includeSubDomains";
	if (config.preload) headerValue += "; preload";

	return (_req: IRequest, res: IResponse, next: NextFunction) => {
		setSecurityHeader(res, SECURITY_HEADERS.HSTS, headerValue);
		next();
	};
}
