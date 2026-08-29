// src/rate-limit/headers.ts
import type { IResponse } from "../../core/http/response/types/response.types.js";
import type { HeaderConfig, RateLimitResult } from "./types/rateLimit.types.js";

export function applyHeaders(
	res: IResponse,
	meta: RateLimitResult,
	config: Required<HeaderConfig>,
) {
	if (res.headersSent) return;

	if (config.standard) {
		res.setHeader("RateLimit-Limit", meta.limit);
		res.setHeader("RateLimit-Remaining", meta.remaining);
		res.setHeader("RateLimit-Reset", Math.ceil(meta.resetMs / 1000));
	}

	if (config.legacy) {
		res.setHeader("X-RateLimit-Limit", meta.limit);
		res.setHeader("X-RateLimit-Remaining", meta.remaining);
		res.setHeader(
			"X-RateLimit-Reset",
			Math.ceil((Date.now() + meta.resetMs) / 1000),
		);
	}

	if (!meta.allowed && config.retryAfter) {
		res.setHeader("Retry-After", Math.ceil(meta.resetMs / 1000));
	}
}
