/**
 * @fileoverview Type declaration file of modifiers.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IRequest } from "../../../core/http/request/types/request.types.js";
import type { IResponse } from "../../../core/http/response/types/response.types.js";
import type { IHandler } from "../../../core/router/types/router.types.js";
import type {
	IInterceptor,
	IPipelineContext,
	ISerializer,
	ITransformer,
} from "../../pipeline.types.js";

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

export interface ICapturedResponse {
	method: string;
	args: unknown[];
}

export interface IResponseCapture {
	res: IResponse;
	captured: Promise<ICapturedResponse>;
	rejectCaptured: (reason?: unknown) => void;
}

export type HookName =
	| "beforeRequest"
	| "afterRequest"
	| "beforeResponse"
	| "afterResponse";

export interface IRouterPipelineOptions {
	globalMiddlewares?: IHandler[];
	terminalMethods?: string[];
}
