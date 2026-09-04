/**
 * @fileoverview Creates rate-limit middleware that processes requests through the engine,
 * applies headers, handles exceeded limits, and supports configurable fail-open/fail-closed behavior.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IRequest } from "../../../core/http/request/types/request.types.js";
import type { IResponse } from "../../../core/http/response/types/response.types.js";
import type { NextFunction } from "../../../pipelines/next/types/nextFunction.types.js";
import { applyHeaders } from "./applyHeaders.js";
import { normalizeConfig } from "./rateLimit.config.js";
import { RateLimitEngine } from "./rateLimit.engine.js";
import type { RateLimitOptions } from "./types/rateLimit.types.js";

export function createRateLimitMiddleware(options: RateLimitOptions) {
	const normalized = normalizeConfig(options);
	const engine = new RateLimitEngine(normalized);

	return async function rateLimitMiddleware(
		req: IRequest,
		res: IResponse,
		next: NextFunction,
	) {
		try {
			const decision = await engine.processRequest(req);
			applyHeaders(res, decision, normalized.headers);

			if (!decision.allowed) {
				if (normalized.onLimitExceeded) {
					normalized.onLimitExceeded(req, res, decision);
				}
				return res.status
					? res.status(429).json({
							error: "Too Many Requests",
							retryAfterMs: decision.resetMs,
						})
					: res.end();
			}

			return next();
		} catch (err: unknown) {
			if (normalized.onStoreError) normalized.onStoreError(err as Error, req);

			if (normalized.failureMode === "fail-open") {
				return next();
			} else {
				return res.status
					? res.status(500).json({ error: "Rate Limiter Failure" })
					: res.end();
			}
		}
	};
}
