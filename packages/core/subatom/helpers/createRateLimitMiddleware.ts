/**
 * @fileoverview Implements in-memory IP-based rate limiting with request counters, headers,
 * 429 responses, automatic bucket cleanup, and fail-open error handling.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ServerResponse } from "node:http";
import type { IRequest } from "../../../core/http/request/types/request.types.js";
import type { IResponse } from "../../../core/http/response/types/response.types.js";
import type { MiddlewareHandler } from "../../../pipelines/pipeline.types.js";
import { parseRateLimitSpec } from "./parseRateLimitSpec.js";

type RateLimitableResponse = IResponse & {
	rawResponse?: ServerResponse;
};

export function createRateLimitMiddleware(spec: string): MiddlewareHandler {
	const { limit, windowMs } = parseRateLimitSpec(spec);
	const buckets = new Map<string, { count: number; resetAt: number }>();
	let requestCount = 0;

	return (req, res, next) => {
		try {
			if ((requestCount++ & 0xff) === 0) {
				const now = Date.now();
				for (const [key, bucket] of buckets) {
					if (bucket.resetAt <= now) buckets.delete(key);
				}
			}

			const clientKey: string =
				(req as IRequest)?.ip ||
				(req as IRequest)?.raw?.socket?.remoteAddress ||
				(req as IRequest)?.raw?.headers?.["x-forwarded-for"]?.toString() ||
				"unknown";

			const now = Date.now();
			let bucket = buckets.get(clientKey);

			if (!bucket || bucket.resetAt <= now) {
				bucket = { count: 0, resetAt: now + windowMs };
				buckets.set(clientKey, bucket);
			}

			bucket.count += 1;

			const rawRes = (res as RateLimitableResponse)?.rawResponse;
			const remaining = Math.max(limit - bucket.count, 0);

			if (
				rawRes &&
				typeof rawRes.setHeader === "function" &&
				!rawRes.headersSent
			) {
				rawRes.setHeader("X-RateLimit-Limit", String(limit));
				rawRes.setHeader("X-RateLimit-Remaining", String(remaining));
				rawRes.setHeader(
					"X-RateLimit-Reset",
					String(Math.ceil(bucket.resetAt / 1000)),
				);
			}

			if (bucket.count > limit) {
				const retryAfterSec = Math.max(
					Math.ceil((bucket.resetAt - now) / 1000),
					1,
				);

				if (rawRes && !rawRes.writableEnded) {
					rawRes.setHeader?.("Retry-After", String(retryAfterSec));
					rawRes.writeHead(429, { "Content-Type": "application/json" });
					rawRes.end(
						JSON.stringify({
							error: "Too Many Requests",
							message: `Rate limit of ${limit} requests per ${windowMs}ms exceeded.`,
							retryAfter: retryAfterSec,
						}),
					);
				}
				return;
			}

			return next();
		} catch (rateLimitError) {
			// Fail-open: a bug in the limiter should never block legitimate traffic.
			console.error(
				"[Subatom Warning]: Rate limiter middleware failed, allowing request through:",
				rateLimitError,
			);
			return next();
		}
	};
}
