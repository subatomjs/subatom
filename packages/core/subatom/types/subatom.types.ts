/**
 * @fileoverview Official type provider for Subatom class. (ISubatom)
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type {
	ErrorMiddlewareHandler,
	IInterceptor,
	ISerializer,
	ITransformer,
	MiddlewareHandler,
} from "../../../pipelines/pipeline.types.js";
import type {
	IResourceController,
	IResourceOptions,
} from "../../router/types/resource.router.types.js";
import type {
	IGroupOptions,
	IHandler,
	IRouteMetaOptions,
	IRouteOptions,
	IRouter,
	IRouteSchema,
} from "../../router/types/router.types.js";
import type { SubatomServer } from "../../server/SubatomServer.js";
import type { ISubatomServerConfig } from "../../server/types/subatom.server.types.js";
import type { RouteGroupBuilder } from "../subordinate/RouteGroupBuilder.js";

export interface ISubatom {
	// Server Configuration & Lifecycle
	setConfig(config: ISubatomServerConfig): this;
	start(
		overrideConfig?: ISubatomServerConfig,
	): ReturnType<SubatomServer["start"]>;
	listen(
		port?: number,
		host?: string,
		appName?: string,
	): ReturnType<SubatomServer["listen"]>;
	gracefulShutdown(exitCode?: number): void;

	// Middleware & Error Handling
	use(
		fnOrPrefix: MiddlewareHandler | string,
		...rest: Array<MiddlewareHandler | IRouter>
	): this;
	useError(handler: ErrorMiddlewareHandler): this;

	// Pipeline Modifiers
	transformer(transformer: ITransformer): this;
	intercept(interceptor: IInterceptor): this;
	serializer(serializer: ISerializer): this;

	// Group & Resource Routing
	group(prefix: string, router: IRouter): this;
	group(prefix: string, options: IGroupOptions): this;
	group(prefix?: string): RouteGroupBuilder;
	group(
		prefix?: string,
		optionsOrRouter?: IGroupOptions | IRouter,
	): this | RouteGroupBuilder;

	resource(
		basePath: string,
		optionsOrController: IResourceOptions | IResourceController,
		legacyOptions?: IResourceOptions,
	): this;

	// HTTP Method Handlers
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
}

export interface ParsedRateLimit {
	limit: number;
	windowMs: number;
}
