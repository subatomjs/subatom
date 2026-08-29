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
		return parsed.pathname || "/";
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
	const method = req.method || "GET";

	const matchResult = router.match(method, req.url || cleanPath);
	const effectivePipelineConfig = mergePipelineConfigs(
		appPipelineConfig,
		matchResult?.route.routerPipeline,
	);

	const pipeline = new RequestPipeline(effectivePipelineConfig);

	const {
		res: capturedRes,
		captured,
		rejectCaptured,
	} = createResponseCapture(res, options.terminalMethods);

	// Track whether `captured` has actually resolved, without awaiting it here —
	// we just need to know "did something call res.json()/send() etc first?"
	let hasCaptured = false;
	captured
		.then(() => {
			hasCaptured = true;
		})
		.catch(() => {});

	try {
		let capturedMethod = "json";

		const result = await pipeline.execute({
			req,
			res: capturedRes,
			routePath: cleanPath,
			method: req.method,
			runControllerChain: async (ctx: IPipelineContext) => {
				return runInterceptors(
					effectivePipelineConfig.interceptors,
					ctx,
					async () => {
						const dispatchPromise = router
							.dispatch(req, capturedRes, options.globalMiddlewares)
							.catch((err: unknown) => {
								// Only log this when a response was genuinely captured
								// already and this dispatch failure is now happening in
								// the background after Promise.race abandoned it.
								// Ordinary dispatch errors (404s, etc.) fall through
								// silently here and get handled once, correctly, by the
								// outer catch below.
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
