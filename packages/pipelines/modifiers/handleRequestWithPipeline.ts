/**
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

/**
 * @fileoverview
 * This file is the main request handler for Subatom’s request pipeline.
 * It matches the incoming request to a route, merges application-level and route-level pipeline configuration,
 * creates the pipeline, runs interceptors and the controller/middleware chain,
 * and captures responses so they can be handled consistently.
 * It also manages cases where a response is sent before the handler finishes and provides
 * centralized error handling through ErrorFormatter when something fails.
 */

import { ErrorFormatter } from "../../errors/ErrorFormatter.js";
import { normalizeError } from "../../errors/Errors.js";
import type { IRequest } from "../../core/http/request/types/request.types.js";
import type { IResponse } from "../../core/http/response/types/response.types.js";
import type { Router } from "../../core/router/Router.js";
import type { IPipelineContext } from "../pipeline.types.js";
import { RequestPipeline } from "./RequestPipeline.js";
import { runInterceptors } from "./services/interceptorRunner.service.js";
import { mergePipelineConfigs } from "./services/pipelineMerger.service.js";
import {
	createResponseCapture,
	flushCapturedResponse,
} from "./services/responseCapture.service.js";
import type {
	IRequestPipelineConfig,
	IRouterPipelineOptions,
} from "./types/modifiers.types.js";

function extractCleanPath(req: IRequest): string {
	if (req.path && typeof req.path === "string") {
		return req.path;
	}
	const rawUrl = req.url ?? "/";
	try {
		const dummyBase = "http://localhost";
		const parsed = new URL(rawUrl, dummyBase);
		return parsed.pathname || rawUrl.split("?")[0] || "/";
	} catch {
		return rawUrl.split("?")[0] || "/";
	}
}

export async function handleRequestWithPipeline(
	router: Router,
	req: IRequest,
	res: IResponse,
	appPipelineConfig: IRequestPipelineConfig,
	options: IRouterPipelineOptions = {},
): Promise<void> {
	const cleanPath = extractCleanPath(req);
	const resolvedMethod = (req.method || "GET").toUpperCase();

	const matchResult = router.match(resolvedMethod, req.url || cleanPath);
	const effectivePipelineConfig = mergePipelineConfigs(
		appPipelineConfig,
		matchResult?.route?.routerPipeline,
	);

	const pipeline = new RequestPipeline(effectivePipelineConfig);

	const {
		res: capturedRes,
		captured,
		rejectCaptured,
	} = createResponseCapture(res, options.terminalMethods);

	// Track whether `captured` has actually resolved, without awaiting it here
	let hasCaptured = false;
	captured
		.then(() => {
			hasCaptured = true;
		})
		.catch(() => {});

	try {
		let capturedMethod = "json";

		const resolvedRoutePath = matchResult?.route?.path ?? cleanPath;

		const result = await pipeline.execute({
			req,
			res: capturedRes,
			routePath: resolvedRoutePath,
			method: resolvedMethod,
			runControllerChain: async (ctx: IPipelineContext) => {
				return runInterceptors(
					effectivePipelineConfig.interceptors,
					ctx,
					async () => {
						const dispatchPromise = router
							.dispatch(req, capturedRes, options.globalMiddlewares)
							.catch((err: unknown) => {
								if (hasCaptured) {
									console.error(
										"[Subatom Error]: Handler chain rejected after response was already captured.",
										err,
									);
								}
								throw err;
							});

						const outcome = await Promise.race([
							captured.then((cap) => ({ type: "captured" as const, cap })),
							dispatchPromise.then((val) => ({
								type: "returned" as const,
								val,
							})),
						]);

						if (outcome.type === "captured") {
							capturedMethod = outcome.cap.method;
							return outcome.cap.args[0];
						}

						return outcome.val;
					},
				);
			},
		});

		if (!res.writableEnded) {
			flushCapturedResponse(res, capturedMethod, [result]);
		}
	} catch (err: unknown) {
		rejectCaptured(err);

		if (res.writableEnded) {
			console.error(
				"[Subatom Error]: Unhandled error occurred after response was already sent.",
				err,
			);
			return;
		}
		ErrorFormatter.handle(normalizeError(err), req, res);
	}
}
