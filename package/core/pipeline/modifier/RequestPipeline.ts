import type {
	IInterceptor,
	IPipelineContext,
	ISerializer,
	ITransformer,
} from "../../../types/framework/pipeline/IPipeline.js";
import type { IRequest } from "../../../types/http/IRequest.js";
import type { IResponse } from "../../../types/http/IResponse.js";
import { runInterceptors } from "./services/interceptorRunner.service.js";
import { runSerializers } from "./services/serializerRunner.service.js";
import {
	runTransformerHook,
	TransformerError,
} from "./services/transformerRunner.service.js";

export interface IRequestPipelineConfig {
	transformers: ITransformer[];
	interceptors: IInterceptor[];
	serializers: ISerializer[];
}

export interface IRequestPipelineOptions {
	req: IRequest;
	res: IResponse;
	routePath?: string;
	method?: string;
	meta?: Record<string, unknown>;
	runControllerChain: (ctx: IPipelineContext) => Promise<unknown>;
}

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
