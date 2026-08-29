/**
 * @fileoverview Recovers orphaned promise rejections within an active request
 *  context and routes them through the configured error-middleware pipeline when the response is still writable.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { AsyncLocalStorage } from "node:async_hooks";
import { handleErrorPipeline } from "./errorPipeline.service.js";
import type { IRequestContext } from "../types/subatom.server.types.js";
import type { ErrorMiddlewareHandler } from "../../../pipelines/pipeline.types.js";

export function tryRecoverFromOrphanedRejection(
	requestContext: AsyncLocalStorage<IRequestContext>,
	errorMiddlewares: ErrorMiddlewareHandler[],
	reason: unknown,
): boolean {
	const store = requestContext.getStore();

	if (!store) {
		return false;
	}

	const { req, res } = store;

	if (res.writableEnded || res.headersSent) {
		return false;
	}

	console.error(
		"[SubatomServer Warning]: Recovered an orphaned promise rejection that " +
			"escaped the middleware pipeline. Routing error through error pipeline.",
	);

	void handleErrorPipeline(reason, req, res, errorMiddlewares);
	return true;
}
