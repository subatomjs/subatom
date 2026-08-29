/**
 * @fileoverview Types provider of router.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type {
	IContext,
	IController,
	IContextMiddleware,
	ILegacyHandler,
	IRouteMiddleware,
} from "../../../context/types/context.types.js";
import type { IRequest } from "../../../core/http/request/types/request.types.js";
import type { IResponse } from "../../../core/http/response/types/response.types.js";
import type { IRequestPipelineConfig } from "../../../pipelines/modifiers/types/modifiers.types.js";
import type { NextFunction } from "../../../pipelines/next/types/nextFunction.types.js";
import type {
	IInterceptor,
	ISerializer,
	ITransformer,
} from "../../../pipelines/pipeline.types.js";
import type {
	IResourceController,
	IResourceOptions,
} from "./resource.router.types.js";

export type {
	IContext,
	IController,
	IContextMiddleware,
	ILegacyHandler,
	IRouteMiddleware,
};

export interface IRouteSchema {
	body?: unknown;
	query?: unknown;
	params?: unknown;
	headers?: unknown;
	file?: unknown;
	files?: unknown;
}

export type IHandler = (
	req: IRequest,
	res: IResponse,
	next: NextFunction,
) => unknown | Promise<unknown>;

export interface IRoutePipelineRef {
	transformers: ITransformer[];
	interceptors: IInterceptor[];
	serializers: ISerializer[];
}

export interface IRoute {
	method: string;
	path: string;
	handlers: IHandler[];
	name?: string;
	tags?: string[];
	rateLimit?: string;
	routerPipeline?: IRequestPipelineConfig;
	schema?: IRouteSchema;
	controller?: IController<unknown, Record<string, unknown>, unknown, unknown>;
	middlewares?: IRouteMiddleware[];
}

export interface IMatchResult {
	route: IRoute;
	params: Record<string, string>;
	query: Record<string, string>;
}

export interface IRouteMetaOptions {
	tags?: string[] | undefined;
	rateLimit?: string | undefined;
	name?: string | undefined;
	schema?: IRouteSchema | undefined;
}

export interface IRouteOptions<
	TSchema extends IRouteSchema = IRouteSchema,
	TLocals extends Record<string, unknown> = Record<string, unknown>,
	TUser = unknown,
	TReturn = unknown,
> {
	name?: string;
	tags?: string[];
	rateLimit?: string;
	schema?: TSchema;
	middleware?: Array<IRouteMiddleware<TSchema, TLocals, TUser>>;
	controller: IController<TSchema, TLocals, TUser, TReturn>;
}

export interface IGroupOptions {
	name?: string;
	prefix?: string;
	middleware?: Array<IRouteMiddleware>;
	tags?: string[];
	rateLimit?: string;
	routes?: (router: IRouter) => void;
}

export type RouteArgument<TSchema extends IRouteSchema = IRouteSchema> =
	| IRouteOptions<TSchema, Record<string, unknown>, unknown, unknown>
	| IHandler
	| IRouteMiddleware<TSchema, Record<string, unknown>, unknown>
	| IRouteMetaOptions;

export interface IRouter {
	get<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	get(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

	post<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	post(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

	put<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	put(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

	patch<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	patch(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

	delete<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	delete(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

	options<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	options(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

	head<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	head(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

	trace<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	trace(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

	connect<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	connect(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

	query<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	query(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

	all<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	all(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

	group(prefix: string, options?: IGroupOptions): this;
	group(prefix: string, routesCallback: (router: IRouter) => void): this;

	transformer(transformer: ITransformer): void;
	intercept(interceptor: IInterceptor): void;
	serializer(serializer: ISerializer): void;
	getPipelineConfig(): IRequestPipelineConfig;

	resource(
		basePath: string,
		optionsOrController: IResourceOptions | IResourceController,
		legacyOptions?: IResourceOptions,
	): void;

	use(
		pathOrHandler: string | IHandler | IRouteMiddleware | IRouter,
		...handlers: Array<IHandler | IRouteMiddleware | IRouter>
	): void;

	getRoutes(): IRoute[];
	clearRoutes(): void;
	registerWithMeta(
		method: string,
		path: string,
		handlers: IHandler[],
		meta?: IRouteMetaOptions,
	): void;
	findRouteByName(name: string): IRoute | undefined;
	hasRoute(name: string): boolean;
	urlFor(
		name: string,
		params?: Record<string, string | number>,
		query?: Record<string, string | number | boolean>,
	): string;

	match(method?: string, rawUrl?: string): IMatchResult | undefined;
	dispatch(
		req: IRequest,
		res: IResponse,
		globalMiddlewares?: IHandler[],
	): Promise<void>;
	handleRequest(
		req: IRequest,
		res: IResponse,
		globalMiddlewares?: IHandler[],
	): Promise<void>;
}

export interface ParsedRouteArgs {
	handlers: IHandler[];
	options: IRouteMetaOptions;
}
