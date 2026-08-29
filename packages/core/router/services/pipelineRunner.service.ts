/**
 * @fileoverview Executes request handlers sequentially, supporting async operations, next() flow,
 * error propagation, and preventing pipeline execution after settlement.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IRequest } from "../../../core/http/request/types/request.types.js";
import type { IResponse } from "../../../core/http/response/types/response.types.js";
import type { IHandler } from "../types/router.types.js";

export async function runPipeline(
	handlers: IHandler[],
	req: IRequest,
	res: IResponse,
): Promise<void> {
	let index = 0;
	let settled = false;

	const next = async (err?: unknown): Promise<void> => {
		if (settled) {
			console.warn(
				"[Subatom Warning]: next() was called after the request pipeline already settled; ignoring.",
			);
			return;
		}

		if (err) {
			settled = true;
			throw err;
		}

		if (res.writableEnded || index >= handlers.length) {
			settled = true;
			return;
		}

		const handler = handlers[index++];
		if (!handler) {
			return next();
		}

		try {
			await Promise.resolve(handler(req, res, next));
		} catch (handlerError) {
			settled = true;
			throw handlerError;
		}
	};

	await next();
}
