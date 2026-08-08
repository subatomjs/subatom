import type { ErrorMiddlewareHandler } from "../../../../types/http/IMiddleware.js";
import type { IRequest } from "../../../../types/http/IRequest.js";
import type { IResponse } from "../../../../types/http/IResponse.js";
import { normalizeError } from "../../../http/errors/Error.js";
import { ErrorFormatter } from "../../../http/errors/errorFormatter.js";

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
				await errorMiddleware(currentErr, req, res, runErrorPipeline);
			} catch (nextErr) {
				await runErrorPipeline(nextErr);
			}
		} else {
			ErrorFormatter.handle(normalizeError(currentErr), req, res);
		}
	};

	await runErrorPipeline(err);
}
