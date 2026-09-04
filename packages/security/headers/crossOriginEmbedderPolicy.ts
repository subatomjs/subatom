/**
 * @fileoverview Adds COEP security middleware, configuring and setting the
 * Cross-Origin-Embedder-Policy header on responses.
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
	type CrossOriginEmbedderPolicyConfig,
	defaultCrossOriginEmbedderPolicyConfig,
} from "../types/header.types.js";

export function createCrossOriginEmbedderPolicyMiddleware(
	options?: Partial<CrossOriginEmbedderPolicyConfig> | boolean,
) {
	const config = normalizeSecurityConfig(
		defaultCrossOriginEmbedderPolicyConfig,
		options,
	);
	if (!config)
		return (_req: IRequest, _res: IResponse, next: NextFunction) => next();

	return (_req: IRequest, res: IResponse, next: NextFunction) => {
		setSecurityHeader(
			res,
			SECURITY_HEADERS.COEP,
			config.policy || "require-corp",
		);
		next();
	};
}
