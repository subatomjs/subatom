import { RateLimitConfigError } from "../../errors/RateLimitError.js";
import type {
	NormalizedConfig,
	NormalizedPolicy,
	RateLimitOptions,
} from "./types/rateLimit.types.js";

export function parseDuration(duration: string | number): number {
	if (typeof duration === "number") return duration;
	const match = /^(\d+)(s|m|h|d)?$/.exec(duration.trim());
	if (!match?.[1]) {
		throw new RateLimitConfigError(`Invalid duration format: ${duration}`);
	}
	const val = parseInt(match[1], 10);
	const unit = match[2] || "ms";
	switch (unit) {
		case "s":
			return val * 1000;
		case "m":
			return val * 60 * 1000;
		case "h":
			return val * 3600 * 1000;
		case "d":
			return val * 86400 * 1000;
		default:
			return val;
	}
}

export function normalizeConfig(options: RateLimitOptions): NormalizedConfig {
	const policiesConfig = options.policies || [options];
	if (!policiesConfig.length) {
		throw new RateLimitConfigError("At least one policy must be provided.");
	}

	const policies: NormalizedPolicy[] = policiesConfig.map((p, idx) => {
		const algorithm = p.algorithm || "sliding-window";
		const name = p.name || `policy_${idx}`;
		const keyResolver = p.key || "ip";

		if (algorithm === "token-bucket") {
			const capacity = p.capacity ?? p.limit;
			if (!capacity || capacity <= 0) {
				throw new RateLimitConfigError(
					`Policy ${name}: Token bucket requires positive 'capacity' or 'limit'.`,
				);
			}
			const refillIntervalMs = parseDuration(
				p.refillInterval || p.window || "1s",
			);
			const refillRate = p.refillRate || 1;
			return {
				name,
				algorithm,
				limit: capacity,
				windowMs: refillIntervalMs,
				capacity,
				refillRate,
				refillIntervalMs,
				keyResolver,
			};
		}

		const limit = p.limit;
		if (!limit || limit <= 0) {
			throw new RateLimitConfigError(
				`Policy ${name}: Requires positive 'limit'.`,
			);
		}
		const windowMs = parseDuration(p.window || "1m");
		return {
			name,
			algorithm,
			limit,
			windowMs,
			capacity: limit,
			refillRate: 0,
			refillIntervalMs: windowMs,
			keyResolver,
		};
	});

	return {
		policies,
		store: options.store || "memory",
		redisClient: options.redisClient,
		headers: {
			standard: options.headers?.standard ?? true,
			legacy: options.headers?.legacy ?? false,
			retryAfter: options.headers?.retryAfter ?? true,
		},
		failureMode: options.failureMode || "fail-open",
		onLimitExceeded: options.onLimitExceeded,
		onStoreError: options.onStoreError,
	};
}
