/**
 * @fileoverview Adds Frameguard middleware, setting X-Frame-Options to
 * control whether pages can be embedded in frames or iframes.
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
import {
	defaultFrameguardConfig,
	type FrameguardConfig,
} from "../types/header.types.js";

export function createFrameguardMiddleware(
	options?: Partial<FrameguardConfig> | boolean,
) {
	const config = normalizeSecurityConfig(defaultFrameguardConfig, options);
	if (!config)
		return (_req: IRequest, _res: IResponse, next: NextFunction) => next();

	return (_req: IRequest, res: IResponse, next: NextFunction) => {
		setSecurityHeader(
			res,
			SECURITY_HEADERS.X_FRAME_OPTIONS,
			config.action || "SAMEORIGIN",
		);
		next();
	};
}
