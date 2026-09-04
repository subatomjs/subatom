/**
 * @fileoverview RequestPipeline orchestrates the end-to-end lifecycle of an HTTP request.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { TransformerError } from "../../errors/modifiers/TransformerError.js";
import type { IPipelineContext } from "../pipeline.types.js";
import { runInterceptors } from "./services/interceptorRunner.service.js";
import { runSerializers } from "./services/serializerRunner.service.js";
import { runTransformerHook } from "./services/transformerRunner.service.js";
import type {
	IRequestPipelineConfig,
	IRequestPipelineOptions,
} from "./types/modifiers.types.js";

export class RequestPipeline {
	constructor(private readonly config: Readonly<IRequestPipelineConfig>) {}

	public async execute(options: IRequestPipelineOptions): Promise<unknown> {
		const { req, res, routePath, method, meta, runControllerChain } = options;

		const ctx: IPipelineContext = {
			req,
			res,
			routePath: routePath ?? req.path ?? "",
			method: method ?? req.method ?? "GET",
			meta: Object.freeze({ ...(meta ?? {}) }),
			state: {},
		};

		// 1. beforeRequest — receives ctx directly as defined in BeforeRequestFn
		await runTransformerHook(
			this.config.transformers,
			"beforeRequest",
			ctx,
			ctx,
		);

		// 2. Controller/Middleware Chain Phase
		const controllerResult = await runControllerChain(ctx);

		// 3. afterRequest — transform raw controller result: (data, ctx)
		const dataAfterRequest = await runTransformerHook(
			this.config.transformers,
			"afterRequest",
			controllerResult,
			ctx,
		);

		// 4. beforeResponse — shape response envelope: (data, ctx)
		const responseEnvelope = await runTransformerHook(
			this.config.transformers,
			"beforeResponse",
			dataAfterRequest,
			ctx,
		);

		// 5. serializers — wire-format shaping
		const contentType = res.get?.("content-type")?.toString();
		const serialized = await runSerializers(
			this.config.serializers,
			responseEnvelope,
			ctx,
			contentType,
		);

		// 6. afterResponse — final observation/mutation: (data, ctx)
		return await runTransformerHook(
			this.config.transformers,
			"afterResponse",
			serialized,
			ctx,
		);
	}
}

export { runInterceptors, TransformerError };
