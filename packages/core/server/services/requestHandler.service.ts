/**
 * @fileoverview Processes incoming HTTP requests by creating
 * request/response wrappers, establishing request context,
 * executing the pipeline, and routing errors through error middleware.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { IRouter } from "../../router/types/router.types.js";
import type {
	ErrorMiddlewareHandler,
	MiddlewareHandler,
} from "../../../pipelines/pipeline.types.js";
import type { IRequestContext } from "../types/subatom.server.types.js";
import type { IRequestPipelineConfig } from "../../../pipelines/modifiers/types/modifiers.types.js";
import { handleRequestWithPipeline } from "../../../pipelines/modifiers/handleRequestWithPipeline.js";
import type { Router } from "../../router/Router.js";
import { handleErrorPipeline } from "./errorPipeline.service.js";
import { Request } from "../../../core/http/request/Request.js";
import { Response } from "../../../core/http/response/Response.js";

export interface ITrackedIncomingMessage extends IncomingMessage {
	startTime?: number;
	id?: string;
}

export async function processHttpRequest(
	native_request: IncomingMessage,
	native_response: ServerResponse,
	router: IRouter,
	middlewares: MiddlewareHandler[],
	errorMiddlewares: ErrorMiddlewareHandler[],
	requestContext: AsyncLocalStorage<IRequestContext>,
	pipelineConfig: IRequestPipelineConfig,
): Promise<void> {
	const trackedRequest = native_request as ITrackedIncomingMessage;
	trackedRequest.startTime ??= performance.now();
	trackedRequest.id ??= crypto.randomUUID();

	const request = new Request(native_request);
	const response = new Response(native_response);

	await requestContext.run({ req: request, res: response }, async () => {
		try {
			await handleRequestWithPipeline(
				router as Router,
				request,
				response,
				pipelineConfig,
				{
					globalMiddlewares: middlewares,
				},
			);
		} catch (error: unknown) {
			await handleErrorPipeline(error, request, response, errorMiddlewares);
		}
	});
}
