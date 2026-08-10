interface ParsedRateLimit {
	limit: number;
	windowMs: number;
}

export function parseRateLimitSpec(spec: string): ParsedRateLimit {
	if (typeof spec !== "string" || spec.trim().length === 0) {
		throw new TypeError(
			`[Subatom] rateLimit() requires a non-empty string like "100/min".`,
		);
	}

	const match = /^(\d+)\s*\/\s*([a-zA-Z]+)$/.exec(spec.trim());

	if (!match) {
		throw new TypeError(
			`[Subatom] Invalid rate limit specification "${spec}". Expected a format like "100/min".`,
		);
	}

	const limit = Number(match[1]);
	const unit = match[2]!.toLowerCase();

	if (!Number.isFinite(limit) || limit <= 0) {
		throw new TypeError(
			`[Subatom] Invalid rate limit count in "${spec}". Must be a positive integer.`,
		);
	}

	let windowMs: number;
	switch (unit) {
		case "ms":
		case "millisecond":
		case "milliseconds":
			windowMs = 1;
			break;
		case "s":
		case "sec":
		case "secs":
		case "second":
		case "seconds":
			windowMs = 1_000;
			break;
		case "m":
		case "min":
		case "mins":
		case "minute":
		case "minutes":
			windowMs = 60_000;
			break;
		case "h":
		case "hr":
		case "hrs":
		case "hour":
		case "hours":
			windowMs = 3_600_000;
			break;
		case "d":
		case "day":
		case "days":
			windowMs = 86_400_000;
			break;
		default:
			throw new TypeError(
				`[Subatom] Invalid rate limit unit "${unit}" in "${spec}". Supported units: ms, s, m, h, d.`,
			);
	}

	return { limit, windowMs };
}
