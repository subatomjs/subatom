import type { Router } from "../../../router/Router.js";
import { combinePaths } from "../helpers/combinePath.js";

export function mergeSubRouter(
	targetRouter: Router,
	prefix: string,
	subRouter: Router,
): void {
	for (const route of subRouter.getRoutes()) {
		const fullPath = combinePaths(prefix, route.path);
		targetRouter.getRoutes().push({
			method: route.method,
			path: fullPath,
			handlers: route.handlers,
			...(route.tags !== undefined ? { tags: route.tags } : {}),
			...(route.rateLimit !== undefined ? { rateLimit: route.rateLimit } : {}),
		});
	}
}

export function mergeRouter(targetRouter: Router, subRouter: Router): void {
	for (const route of subRouter.getRoutes()) {
		targetRouter.getRoutes().push(route);
	}
}
