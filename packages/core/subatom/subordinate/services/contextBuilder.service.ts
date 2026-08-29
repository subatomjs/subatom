/**
 * @fileoverview Builds nested route-group context by merging parent and local prefixes,
 * middleware, tags, and rate-limit settings.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { MiddlewareHandler } from "../../../../pipelines/pipeline.types.js";
import type { IGroupContext } from "../../../server/types/subatom.server.types.js";
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
