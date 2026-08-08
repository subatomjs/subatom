import type { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { IRequestContext } from "../../../../types/framework/core/IFrameworkCore.js";
import type { IRouter } from "../../../../types/framework/router/IRouter.js";
import type {
	ErrorMiddlewareHandler,
	MiddlewareHandler,
} from "../../../../types/http/IMiddleware.js";
import { Request } from "../../../http/request/Request.js";
import { Response } from "../../../http/response/Response.js";
import { handleErrorPipeline } from "./errorPipeline.service.js";

export async function processHttpRequest(
	native_request: IncomingMessage,
	native_response: ServerResponse,
	router: IRouter,
	middlewares: MiddlewareHandler[],
	errorMiddlewares: ErrorMiddlewareHandler[],
	requestContext: AsyncLocalStorage<IRequestContext>,
): Promise<void> {
	(native_request as any).startTime ??= performance.now();
	(native_request as any).id ??= crypto.randomUUID();

	const request = new Request(native_request);
	const response = new Response(native_response);

	await requestContext.run({ req: request, res: response }, async () => {
		try {
			await router.handleRequest(request, response, middlewares);
		} catch (error: unknown) {
			await handleErrorPipeline(error, request, response, errorMiddlewares);
		}
	});
}
