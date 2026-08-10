import type { AsyncLocalStorage } from "node:async_hooks";
import type { IRequestContext } from "../../../../types/framework/core/IFrameworkCore.js";
import type { ErrorMiddlewareHandler } from "../../../../types/http/IMiddleware.js";
import { handleErrorPipeline } from "./errorPipeline.service.js";

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
