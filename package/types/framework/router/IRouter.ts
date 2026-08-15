// types/framework/router/IRouter.ts

import type { IRequestPipelineConfig } from "../../../core/pipeline/modifier/RequestPipeline.js";
import type { IRequest } from "../../http/IRequest.js";
import type { IResponse } from "../../http/IResponse.js";
import type { NextFunction } from "../pipeline/INext.js";
import type {
	IInterceptor,
	ISerializer,
	ITransformer,
} from "../pipeline/IPipeline.js";

export interface ISchemaObject {
	type?: string;
	properties?: Record<string, any>;
	required?: string[];
	[key: string]: any;
}

export interface IRouteSchema {
	body?: ISchemaObject | Record<string, unknown> | unknown;
	query?: ISchemaObject | Record<string, unknown> | unknown;
	params?: ISchemaObject | Record<string, unknown> | unknown;
	headers?: ISchemaObject | Record<string, unknown> | unknown;

	// Add these for the new file validation capabilities
	file?: ISchemaObject | Record<string, unknown> | unknown;
	files?: ISchemaObject | Record<string, unknown> | unknown;
}

export type IHandler = (
	req: IRequest,
	res: IResponse,
	next: NextFunction,
) => void | Promise<void>;

export interface IRouteSchema {
	body?: unknown;
	query?: unknown;
	params?: unknown;
	headers?: unknown;
}

export interface IRoute {
	method: string;
	path: string;
	handlers: IHandler[];
	tags?: string[];
	rateLimit?: string;
	routerPipeline?: IRoutePipelineRef;
	name?: string;
	schema?: IRouteSchema;
}

export interface IMatchResult {
	route: IRoute;
	params: Record<string, string>;
	query: Record<string, string>;
}

export interface IRouteMeta {
	tags?: string[] | undefined;
	rateLimit?: string | undefined;
	name?: string | undefined;
	schema?: IRouteSchema | undefined;
}

export interface IRouteOptions {
	name?: string;
	tags?: string[];
	rateLimit?: string;
	schema?: IRouteSchema;
}

export interface IRouter {
	get(path: string, ...handlers: IHandler[]): void;
	post(path: string, ...handlers: IHandler[]): void;
	put(path: string, ...handlers: IHandler[]): void;
	patch(path: string, ...handlers: IHandler[]): void;
	delete(path: string, ...handlers: IHandler[]): void;
	options(path: string, ...handlers: IHandler[]): void;
	head(path: string, ...handlers: IHandler[]): void;
	trace(path: string, ...handlers: IHandler[]): void;
	connect(path: string, ...handlers: IHandler[]): void;
	transformer(transformer: ITransformer): void;
	intercept(interceptor: IInterceptor): void;
	serializer(serializer: ISerializer): void;
	getPipelineConfig(): IRequestPipelineConfig;
	query(path: string, ...handlers: IHandler[]): void;
	all(path: string, ...handlers: IHandler[]): void;
	use(pathOrHandler: string | IHandler, ...handlers: IHandler[]): void;
	getRoutes(): IRoute[];
	clearRoutes(): void;
	registerWithMeta(
		method: string,
		path: string,
		handlers: IHandler[],
		meta?: IRouteMeta,
	): void;
	match(method?: string, rawUrl?: string): IMatchResult | undefined;
	handleRequest(
		req: IRequest,
		res: IResponse,
		globalMiddlewares?: IHandler[],
	): Promise<void>;
}

export interface IRoutePipelineRef {
	transformers: ITransformer[];
	interceptors: IInterceptor[];
	serializers: ISerializer[];
}
