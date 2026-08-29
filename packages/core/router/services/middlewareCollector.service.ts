/**
 * @fileoverview Collects all matching USE middleware for a request path,
 * including inherited route parameters and middleware handlers.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IHandler, IRoute } from "../types/router.types.js";
import { matchPath } from "./pathMatch.service.js";

const MIDDLEWARE_METHOD = "USE";

export function collectUseMiddlewares(
	routes: IRoute[],
	pathName: string,
): { handlers: IHandler[]; params: Record<string, string> } {
	const handlers: IHandler[] = [];
	const params: Record<string, string> = Object.create(null);

	for (const route of routes) {
		if (route.method !== MIDDLEWARE_METHOD) continue;

		const matched = matchPath(route.path, pathName, { prefix: true });
		if (matched !== null) {
			Object.assign(params, matched);
			handlers.push(...route.handlers);
		}
	}

	return { handlers, params };
}
