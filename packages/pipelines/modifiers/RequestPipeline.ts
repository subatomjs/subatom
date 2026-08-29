/**
 * @fileoverview Type declaration file of FileUpload.ts & helpers & operations files.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

/**
 * @fileoverview
 * RequestPipeline orchestrates the end-to-end lifecycle of an HTTP request by creating a pipeline
 * context and executing configured modifiers in a strict sequence.
 * It coordinates inbound request mutation through beforeRequest hooks,
 * delegates handler processing via the controller chain, post-processes
 * returned controller payloads using afterRequest and beforeResponse transformers,
 * formats the payload to wire format with content-type serializers,
 * and executes final afterResponse hooks before returning the finalized response data.
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class RequestPipeline {
	constructor(private readonly config: Readonly<IRequestPipelineConfig>) {}

	public async execute(options: IRequestPipelineOptions): Promise<unknown> {
		const { req, res, routePath, method, meta, runControllerChain } = options;

		const ctx: IPipelineContext = {
			req,
			res,
			routePath: routePath ?? "",
			method: method ?? "",
			meta: Object.freeze({ ...(meta ?? {}) }),
			state: {},
		};

		// 1. beforeRequest — safely mutate request object
		const transformedReq = await runTransformerHook(
			this.config.transformers,
			"beforeRequest",
			req,
			ctx,
		);

		if (
			isPlainObject(transformedReq) &&
			transformedReq !== (req as unknown as Record<string, unknown>)
		) {
			Object.assign(req, transformedReq);
		}

		// 2. Controller/Middleware Chain Phase
		const controllerResult = await runControllerChain(ctx);

		// 3. afterRequest — transform raw controller result
		const dataAfterRequest = await runTransformerHook(
			this.config.transformers,
			"afterRequest",
			controllerResult,
			ctx,
		);

		// 4. beforeResponse — shape response envelope
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

		// 6. afterResponse — final observation/mutation
		return await runTransformerHook(
			this.config.transformers,
			"afterResponse",
			serialized,
			ctx,
		);
	}
}
export { runInterceptors, TransformerError };
