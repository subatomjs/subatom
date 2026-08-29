/**
 * @fileoverview Handles errors through the configured error-middleware chain,
 * allowing recovery or propagation before falling back to Subatom’s standard error formatter.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { ErrorFormatter } from "../../../errors/ErrorFormatter.js";
import { normalizeError } from "../../../errors/Errors.js";
import type { ISubatomError } from "../../../errors/types/subatom.error.types.js";
import type { IRequest } from "../../../core/http/request/types/request.types.js";
import type { IResponse } from "../../../core/http/response/types/response.types.js";
import type { ErrorMiddlewareHandler } from "../../../pipelines/pipeline.types.js";

export async function handleErrorPipeline(
	err: unknown,
	req: IRequest,
	res: IResponse,
	errorMiddlewares: ErrorMiddlewareHandler[],
): Promise<void> {
	if (res.writableEnded) {
		console.error(
			"[SubatomServer Warning]: Error occurred after response was sent:",
			err,
		);
		return;
	}

	let errIndex = 0;

	const runErrorPipeline = async (currentErr?: unknown): Promise<void> => {
		if (errIndex < errorMiddlewares.length) {
			const errorMiddleware = errorMiddlewares[errIndex++];

			if (!errorMiddleware) {
				await runErrorPipeline(currentErr);
				return;
			}

			try {
				await errorMiddleware(
					currentErr as ISubatomError,
					req,
					res,
					runErrorPipeline,
				);
			} catch (nextErr) {
				await runErrorPipeline(nextErr);
			}
		} else {
			ErrorFormatter.handle(normalizeError(currentErr), req, res);
		}
	};

	await runErrorPipeline(err);
}
