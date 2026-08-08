import type { IGroupContext } from "../../../../types/framework/core/IFrameworkCore.js";
import type {
	IHandler,
	IRouteMeta,
} from "../../../../types/framework/router/IRouter.js";
import type { Router } from "../../../router/Router.js";
import { combinePaths } from "../helpers/combinePath.js";
import type { HttpMethod } from "../subordinate/RouteGroupBuilder.js";

export function registerGroupRoute(
	targetRouter: Router,
	method: HttpMethod,
	fullPath: string,
	handlers: IHandler[],
	meta: IRouteMeta,
): void {
	const cleanMeta: Partial<Pick<any, "tags" | "rateLimit">> = {};
	if (meta.tags !== undefined) cleanMeta.tags = meta.tags;
	if (meta.rateLimit !== undefined) cleanMeta.rateLimit = meta.rateLimit;
	targetRouter.registerWithMeta(method, fullPath, handlers, cleanMeta);
}

export function registerPossiblyGrouped(
	targetRouter: Router,
	currentContext: IGroupContext | undefined,
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

	if (currentContext) {
		const fullPath = combinePaths(currentContext.prefix, path);
		const combinedHandlers = [
			...currentContext.middlewares,
			...handlers,
		] as unknown as IHandler[];

		const groupMeta: Partial<Pick<any, "tags" | "rateLimit">> = {};
		if (currentContext.tags.length > 0) groupMeta.tags = currentContext.tags;
		if (currentContext.rateLimitSpec !== undefined) {
			groupMeta.rateLimit = currentContext.rateLimitSpec;
		}
		targetRouter.registerWithMeta(
			method,
			fullPath,
			combinedHandlers,
			groupMeta,
		);
	} else {
		targetRouter.registerWithMeta(method, path, handlers, {});
	}
}
