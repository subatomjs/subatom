import type { IGroupContext } from "../../../../../types/framework/core/IFrameworkCore.js";
import type { MiddlewareHandler } from "../../../../../types/http/IMiddleware.js";
import { combinePaths } from "../../helpers/combinePath.js";

export function buildGroupContext(
	parent: IGroupContext | undefined,
	ownPrefix: string,
	ownMiddlewares: MiddlewareHandler[],
	ownTags: string[],
	ownRateLimitSpec?: string,
	ownRateLimitMiddleware?: MiddlewareHandler,
): IGroupContext {
	const prefix = combinePaths(parent?.prefix, ownPrefix);
	const middlewares: MiddlewareHandler[] = [
		...(parent?.middlewares ?? []),
		...ownMiddlewares,
	];
	const tags: string[] = [...(parent?.tags ?? []), ...ownTags];

	const rateLimitSpec = ownRateLimitSpec ?? parent?.rateLimitSpec;
	const rateLimitMiddleware =
		ownRateLimitMiddleware ?? parent?.rateLimitMiddleware;

	return { prefix, middlewares, tags, rateLimitSpec, rateLimitMiddleware };
}
