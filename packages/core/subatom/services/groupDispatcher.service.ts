/**
 * @fileoverview Dispatches group() calls to either merge an existing Router or
 * create a RouteGroupBuilder for fluent route grouping.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { Router } from "../../router/Router.js";
import { mergeSubRouter } from "../../router/services/routerMerger.service.js";
import type { Subatom } from "../Subatom.js";
import { RouteGroupBuilder } from "../subordinate/RouteGroupBuilder.js";

export function dispatchGroup(
	app: Subatom,
	targetRouter: Router,
	prefix?: string,
	router?: Router,
): Subatom | RouteGroupBuilder {
	if (router !== undefined) {
		if (!(router instanceof Router)) {
			throw new TypeError(
				"[Subatom] app.group(prefix, router) expects the second argument to be a Router instance.",
			);
		}

		const safePrefix = typeof prefix === "string" ? prefix : "";
		mergeSubRouter(targetRouter, safePrefix, router);
		return app;
	}

	if (prefix !== undefined && typeof prefix !== "string") {
		throw new TypeError(
			"[Subatom] app.group(prefix) expects 'prefix' to be a string.",
		);
	}

	return new RouteGroupBuilder(app, prefix ?? "");
}
