/**
 * @fileoverview Merges sub-routers into a target router, combining paths and preserving route metadata
 * while preventing duplicate route names.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { combinePaths } from "../../subatom/helpers/combinePath.js";
import type { Router } from "../Router.js";
import type { IRouter } from "../types/router.types.js";

function assertRouterInstance(
	subRouter: unknown,
	callSite: string,
): asserts subRouter is IRouter {
	if (
		typeof subRouter !== "object" ||
		subRouter === null ||
		typeof (subRouter as { getRoutes?: unknown }).getRoutes !== "function"
	) {
		throw new TypeError(
			`[Subatom] ${callSite} expected a Router instance with a getRoutes() ` +
				`method, but received ${typeof subRouter}. This usually means the ` +
				`module resolved to a stale or partially-built copy of "subatom" ` +
				`— try rebuilding the framework (or restarting the dev server) ` +
				`and confirm only one "subatom" is resolved via \`npm ls subatom\`.`,
		);
	}
}

export function mergeSubRouter(
	targetRouter: Router,
	prefix: string,
	subRouter: IRouter,
): void {
	assertRouterInstance(subRouter, "app.use(prefix, subRouter)");

	for (const route of subRouter.getRoutes()) {
		if (route.name) {
			const existing = targetRouter.findRouteByName(route.name);
			if (existing) {
				throw new TypeError(
					`[Subatom] Cannot mount router: route name "${route.name}" ` +
						`(${route.method} ${route.path}) collides with an already-registered ` +
						`route of the same name (${existing.method} ${existing.path}).`,
				);
			}
		}

		const fullPath = combinePaths(prefix, route.path);
		targetRouter.registerMountedRoute({
			method: route.method,
			path: fullPath,
			handlers: [...route.handlers],
			...(route.tags !== undefined ? { tags: route.tags } : {}),
			...(route.rateLimit !== undefined ? { rateLimit: route.rateLimit } : {}),
			...(route.name !== undefined ? { name: route.name } : {}),
			...(route.schema !== undefined ? { schema: route.schema } : {}),
			...(route.routerPipeline !== undefined
				? { routerPipeline: route.routerPipeline }
				: {}),
		});
	}
}

export function mergeRouter(targetRouter: Router, subRouter: IRouter): void {
	assertRouterInstance(subRouter, "app.use(subRouter)");

	for (const route of subRouter.getRoutes()) {
		targetRouter.registerMountedRoute(route);
	}
}
