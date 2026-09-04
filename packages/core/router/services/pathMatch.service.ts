/**
 * @fileoverview Matches incoming paths against route patterns, supporting exact or prefix matching,
 * optional route parameters (:param?), and extracting decoded :param route parameters.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export function matchPath(
	routePath: string,
	incomingPath: string,
	options: { prefix?: boolean } = {},
): Record<string, string> | null {
	const routeSegments = routePath.split("/").filter(Boolean);
	const incomingSegments = incomingPath.split("/").filter(Boolean);

	// 1. Calculate required non-optional segments count
	const requiredSegmentsCount = routeSegments.filter(
		(seg) => !(seg.startsWith(":") && seg.endsWith("?")),
	).length;

	// 2. Validate segment count bounds
	if (options.prefix) {
		if (incomingSegments.length < requiredSegmentsCount) return null;
	} else if (
		incomingSegments.length < requiredSegmentsCount ||
		incomingSegments.length > routeSegments.length
	) {
		return null;
	}

	const params: Record<string, string> = Object.create(null);

	// 3. Match segment-by-segment
	for (let i = 0; i < routeSegments.length; i++) {
		const routeSeg = routeSegments[i];
		const incomingSeg = incomingSegments[i];

		if (!routeSeg) return null;

		const isOptionalParam = routeSeg.startsWith(":") && routeSeg.endsWith("?");
		const isRequiredParam = routeSeg.startsWith(":") && !routeSeg.endsWith("?");

		// Case A: Optional param segment omitted by incoming request
		if (isOptionalParam && !incomingSeg) {
			continue;
		}

		// Case B: Non-optional segment missing in incoming path
		if (!incomingSeg) {
			return null;
		}

		// Case C: Dynamic param segment (:id or :id?)
		if (isOptionalParam || isRequiredParam) {
			const paramName = isOptionalParam
				? routeSeg.slice(1, -1)
				: routeSeg.slice(1);

			if (!paramName) return null;

			try {
				params[paramName] = decodeURIComponent(incomingSeg);
			} catch {
				return null;
			}
		} else if (routeSeg !== incomingSeg) {
			// Case D: Static path segment mismatch
			return null;
		}
	}

	return params;
}
