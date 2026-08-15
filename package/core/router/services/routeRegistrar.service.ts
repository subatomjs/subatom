// routeRegistrar.service.js
// import type { IGroupContext } from "../../../../types/framework/core/IFrameworkCore.js";
// import type {
// 	IHandler,
// 	IRouteMeta,
// 	IRouteOptions,
// } from "../../../../types/framework/router/IRouter.js";
// import type { Router } from "../../../router/Router.js";
// import { combinePaths } from "../helpers/combinePath.js";

import type { IGroupContext } from "../../../types/framework/core/IFrameworkCore.js";
import type {
	IHandler,
	IRouteMeta,
	IRouteOptions,
} from "../../../types/framework/router/IRouter.js";
import { combinePaths } from "../../bootstrap/subatom/helpers/combinePath.js";
import type { HttpMethod } from "../../bootstrap/subatom/subordinate/RouteGroupBuilder.js";
import { parseRouteArgs } from "../helpers/parseRouteArgs.js";
import type { Router } from "../Router.js";

export function registerGroupRoute(
	targetRouter: Router,
	method: HttpMethod,
	fullPath: string,
	handlers: IHandler[],
	meta: IRouteMeta,
): void {
	const cleanMeta: Partial<IRouteMeta> = {};
	if (meta.tags !== undefined) cleanMeta.tags = meta.tags;
	if (meta.rateLimit !== undefined) cleanMeta.rateLimit = meta.rateLimit;
	if (meta.name !== undefined) cleanMeta.name = meta.name;
	targetRouter.registerWithMeta(method, fullPath, handlers, cleanMeta);
}

export function registerPossiblyGrouped(
	targetRouter: Router,
	currentContext: IGroupContext | undefined,
	method: HttpMethod,
	path: string,
	args: Array<IHandler | IRouteOptions>,
): void {
	if (typeof path !== "string" || path.length === 0) {
		throw new TypeError(
			`[Subatom] Route path for ${method} must be a non-empty string.`,
		);
	}

	const { handlers, options } = parseRouteArgs(args);

	if (handlers.length === 0) {
		throw new TypeError(
			`[Subatom] Route "${method} ${path}" requires at least one handler function.`,
		);
	}

	if (currentContext) {
		const fullPath = combinePaths(currentContext.prefix, path);
		const combinedHandlers = [
			...currentContext.middlewares,
			...handlers,
		] as unknown as IHandler[];

		const groupMeta: Partial<IRouteMeta> = {};
		if (currentContext.tags.length > 0) groupMeta.tags = currentContext.tags;
		if (currentContext.rateLimitSpec !== undefined) {
			groupMeta.rateLimit = currentContext.rateLimitSpec;
		}
		if (options.name !== undefined) groupMeta.name = options.name;

		targetRouter.registerWithMeta(
			method,
			fullPath,
			combinedHandlers,
			groupMeta,
		);
	} else {
		const meta: Partial<IRouteMeta> = {};
		if (options.name !== undefined) meta.name = options.name;
		targetRouter.registerWithMeta(method, path, handlers, meta);
	}
}
