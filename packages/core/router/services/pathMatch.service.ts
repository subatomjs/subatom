/**
 * @fileoverview Matches incoming paths against route patterns, supporting exact or prefix matching
 * and extracting decoded :param route parameters.
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

	if (options.prefix) {
		if (routeSegments.length > incomingSegments.length) return null;
	} else if (routeSegments.length !== incomingSegments.length) {
		return null;
	}

	const params: Record<string, string> = Object.create(null);

	for (let i = 0; i < routeSegments.length; i++) {
		const routeSeg = routeSegments[i];
		const incomingSeg = incomingSegments[i];

		if (!routeSeg || !incomingSeg) return null;

		if (routeSeg.startsWith(":")) {
			const paramName = routeSeg.slice(1);
			if (!paramName) return null;

			try {
				params[paramName] = decodeURIComponent(incomingSeg);
			} catch {
				return null;
			}
		} else if (routeSeg !== incomingSeg) {
			return null;
		}
	}

	return params;
}
