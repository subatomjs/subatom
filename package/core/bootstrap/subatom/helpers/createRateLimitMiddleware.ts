import type { MiddlewareHandler } from "../../../../types/http/IMiddleware.js";
import { IRequest } from "../../../../types/http/IRequest.js";
import { parseRateLimitSpec } from "./parseRateLimitSpec.js";

export function createRateLimitMiddleware(spec: string): MiddlewareHandler {
	const { limit, windowMs } = parseRateLimitSpec(spec);
	const buckets = new Map<string, { count: number; resetAt: number }>();

	const sweepIntervalMs = Math.max(windowMs, 1_000);
	const sweepTimer = setInterval(() => {
		const now = Date.now();
		for (const [key, bucket] of buckets) {
			if (bucket.resetAt <= now) {
				buckets.delete(key);
			}
		}
	}, sweepIntervalMs);

	// Never let this background timer keep the Node process alive.
	if (typeof sweepTimer.unref === "function") {
		sweepTimer.unref();
	}

	return (req, res, next) => {
		try {
			const clientKey: string =
				(req as IRequest)?.ip ||
				(req as IRequest)?.rawRequest?.socket?.remoteAddress ||
				(req as IRequest)?.rawRequest?.headers?.["x-forwarded-for"] ||
				"unknown";

			const now = Date.now();
			let bucket = buckets.get(clientKey);

			if (!bucket || bucket.resetAt <= now) {
				bucket = { count: 0, resetAt: now + windowMs };
				buckets.set(clientKey, bucket);
			}

			bucket.count += 1;

			const rawRes = (res as any)?.rawResponse;
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
