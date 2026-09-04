/**
 * @fileoverview Adds Referrer Policy middleware, configuring the Referrer-Policy
 * header to control referrer information sent with requests.
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
	defaultReferrerPolicyConfig,
	type ReferrerPolicyConfig,
} from "../types/header.types.js";

export function createReferrerPolicyMiddleware(
	options?: Partial<ReferrerPolicyConfig> | boolean,
) {
	const config = normalizeSecurityConfig(defaultReferrerPolicyConfig, options);
	if (!config)
		return (_req: IRequest, _res: IResponse, next: NextFunction) => next();

	const value = Array.isArray(config.policy)
		? config.policy.join(", ")
		: config.policy;

	return (_req: IRequest, res: IResponse, next: NextFunction) => {
		setSecurityHeader(
			res,
			SECURITY_HEADERS.REFERRER_POLICY,
			value || "no-referrer",
		);
		next();
	};
}
