/**
 * @fileoverview Registers a grouped HTTP route by combining paths, middleware, rate limits,
 * handlers, and metadata before adding it to the Subatom router.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type {
	IHandler,
	IRouteMetaOptions,
} from "../../../router/types/router.types.js";
import type { IGroupContext } from "../../../server/types/subatom.server.types.js";
import { combinePaths } from "../../helpers/combinePath.js";
import type { Subatom } from "../../Subatom.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export function registerGroupRoute(
	app: Subatom,
	context: IGroupContext,
	method: HttpMethod,
	path: string,
	handlers: IHandler[],
): void {
	if (typeof path !== "string" || path.length === 0) {
		throw new TypeError(
			`[Subatom] Route path for ${method} must be a non-empty string.`,
		);
	}

	if (!Array.isArray(handlers) || handlers.length === 0) {
		throw new TypeError(
			`[Subatom] Route "${method} ${path}" requires at least one handler function.`,
		);
	}

	const fullPath = combinePaths(context.prefix, path);

	const combinedHandlers = [
		...(context.rateLimitMiddleware ? [context.rateLimitMiddleware] : []),
		...context.middlewares,
		...handlers,
	] as unknown as IHandler[];

	const meta: IRouteMetaOptions = {};
	if (context.tags.length > 0) meta.tags = context.tags;
	if (context.rateLimitSpec !== undefined) {
		meta.rateLimit = context.rateLimitSpec;
	}

	app._registerGroupRoute(method, fullPath, combinedHandlers, meta);
}
