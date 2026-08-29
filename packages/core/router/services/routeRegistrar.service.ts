/**
 * @fileoverview Registers routes with or without group context, merging prefixes, middleware,
 * tags, rate limits, schemas, names, and controllers.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IGroupContext } from "../../server/types/subatom.server.types.js";
import { combinePaths } from "../../subatom/helpers/combinePath.js";
import type { HttpMethod } from "../../subatom/subordinate/RouteGroupBuilder.js";
import { isRouteOptions, parseRouteArgs } from "../helpers/parseRouteArgs.js";
import type { Router } from "../Router.js";
import type {
	IHandler,
	IRouteMetaOptions,
	IRouteOptions,
	RouteArgument,
} from "../types/router.types.js";

export function registerGroupRoute(
	targetRouter: Router,
	method: HttpMethod,
	fullPath: string,
	handlers: IHandler[],
	meta: IRouteMetaOptions,
): void {
	const cleanMeta: Partial<IRouteMetaOptions> = {};
	if (meta.tags !== undefined) cleanMeta.tags = meta.tags;
	if (meta.rateLimit !== undefined) cleanMeta.rateLimit = meta.rateLimit;
	if (meta.name !== undefined) cleanMeta.name = meta.name;
	if (meta.schema !== undefined) cleanMeta.schema = meta.schema;
	targetRouter.registerWithMeta(method, fullPath, handlers, cleanMeta);
}

export function registerPossiblyGrouped(
	targetRouter: Router,
	currentContext: IGroupContext | undefined,
	method: HttpMethod,
	path: string,
	args: Array<RouteArgument>,
): void {
	if (typeof path !== "string" || path.length === 0) {
		throw new TypeError(
			`[Subatom] Route path for ${method} must be a non-empty string.`,
		);
	}

	if (args.length === 1 && isRouteOptions(args[0])) {
		const opts = args[0] as IRouteOptions;
		if (currentContext) {
			const fullPath = combinePaths(currentContext.prefix, path);
			const mergedTags = Array.from(
				new Set([...currentContext.tags, ...(opts.tags || [])]),
			);
			const effectiveRateLimit = opts.rateLimit ?? currentContext.rateLimitSpec;

			const groupMiddlewares = (opts.middleware || []).map(
				(mw) => mw as unknown as IHandler,
			);
			const controllerHandler = opts.controller as unknown as IHandler;

			targetRouter.registerWithMeta(
				method,
				fullPath,
				[...groupMiddlewares, controllerHandler],
				{
					name: opts.name,
					tags: mergedTags.length > 0 ? mergedTags : undefined,
					rateLimit: effectiveRateLimit,
					schema: opts.schema,
				},
			);
			return;
		}

		targetRouter[method.toLowerCase() as "get"](path, opts);
		return;
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
			...(currentContext.rateLimitMiddleware
				? [currentContext.rateLimitMiddleware]
				: []),
			...currentContext.middlewares,
			...handlers,
		] as unknown as IHandler[];

		const groupMeta: Partial<IRouteMetaOptions> = {};
		if (currentContext.tags.length > 0) groupMeta.tags = currentContext.tags;
		if (currentContext.rateLimitSpec !== undefined) {
			groupMeta.rateLimit = currentContext.rateLimitSpec;
		}
		if (options.name !== undefined) groupMeta.name = options.name;
		if (options.schema !== undefined) groupMeta.schema = options.schema;

		targetRouter.registerWithMeta(
			method,
			fullPath,
			combinedHandlers,
			groupMeta,
		);
	} else {
		targetRouter.registerWithMeta(method, path, handlers, options);
	}
}
