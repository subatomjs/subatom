import type { IHandler } from "../../../types/framework/router/IRouter.js";
import type { IRequest } from "../../../types/http/IRequest.js";
import type { IResponse } from "../../../types/http/IResponse.js";

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
