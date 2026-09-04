/**
 * @fileoverview Core Subatom application entry point for routes, middleware,
 * WebSockets, pipelines, server lifecycle, and graceful shutdown.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IEnvOptions } from "../../../config/config.export.js";
import { configEnv } from "../../../config/env/env.js";
import {
	registerInterceptor,
	registerSerializer,
	registerTransformer,
} from "../../pipelines/modifiers/services/pipelineRegistrar.service.js";
import type { IRequestPipelineConfig } from "../../pipelines/modifiers/types/modifiers.types.js";
import type {
	ErrorMiddlewareHandler,
	IInterceptor,
	ISerializer,
	ITransformer,
	MiddlewareHandler,
} from "../../pipelines/pipeline.types.js";
import isRouterInstance from "../router/helpers/isRouterInstance.js";
import { Router } from "../router/Router.js";
import { registerPossiblyGrouped } from "../router/services/routeRegistrar.service.js";
import { mergeSubRouter } from "../router/services/routerMerger.service.js";
import type {
	IResourceController,
	IResourceOptions,
} from "../router/types/resource.router.types.js";
import type {
	IGroupOptions,
	IHandler,
	IRoute,
	IRouteMetaOptions,
	IRouteOptions,
	IRouter,
	IRouteSchema,
	RouteArgument,
} from "../router/types/router.types.js";
import type {
	ISocketHandlers,
	ISocketRoute,
} from "../../socket/types/socket.types.js";
import type { SubatomServer } from "../server/SubatomServer.js";
import type {
	IGroupContext,
	ISubatomServerConfig,
} from "../server/types/subatom.server.types.js";
import { dispatchGroup } from "./services/groupDispatcher.service.js";
import { registerMiddleware } from "./services/middlewareRegistrar.service.js";
import { registerProcessBoundary } from "./services/processBoundary.service.js";
import {
	ensureServerInstance,
	performGracefulShutdown,
} from "./services/serverManager.service.js";
import type {
	HttpMethod,
	RouteGroupBuilder,
} from "./subordinate/RouteGroupBuilder.js";
import { registerGroupRoute } from "../router/services/routeRegistrar.service.js";
import type { IPipelineContext } from "../../pipelines/pipeline.types.js";
import type { ISubatom } from "./types/subatom.types.js";

export class Subatom implements ISubatom {
	private readonly router = new Router();
	private readonly middlewares: MiddlewareHandler[] = [];
	private readonly errorMiddlewares: ErrorMiddlewareHandler[] = [];
	private readonly wsRoutes: ISocketRoute[] = [];
	private serverInstance?: SubatomServer;
	private customConfig: ISubatomServerConfig = {};

	private readonly transformers: ITransformer[] = [];
	private readonly interceptors: IInterceptor[] = [];
	private readonly serializers: ISerializer[] = [];

	private readonly groupContextStack: IGroupContext[] = [];
	private readonly unregisterProcessBoundary?: () => void;

	constructor(envOptions?: IEnvOptions) {
		configEnv(envOptions);
		const unreg = registerProcessBoundary(
			() => this.serverInstance,
			(exitCode) => this.gracefulShutdown(exitCode),
		);
		if (typeof unreg === "function") {
			this.unregisterProcessBoundary = unreg;
		}
	}

	// 1. Web socket connection handle method.
	public ws<
		TParams extends Record<string, string | undefined> = Record<
			string,
			string | undefined
		>,
		TQuery extends Record<string, string | undefined> = Record<
			string,
			string | undefined
		>,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
	>(path: string, handlers: ISocketHandlers<TParams, TQuery, TLocals>): this {
		const route: ISocketRoute = {
			path,
			handlers: handlers as unknown as ISocketHandlers,
		};
		this.wsRoutes.push(route);
		if (this.serverInstance) {
			this.serverInstance.webSocket.register(path, handlers);
		}
		return this;
	}

	// 2. Set config to set configuration from root file.
	public setConfig(config: ISubatomServerConfig): this {
		this.customConfig = { ...this.customConfig, ...config };
		if (this.serverInstance) {
			this.serverInstance.setConfig(this.customConfig);
		}
		return this;
	}

	// 3. use middleware method.
	public use(
		fnOrPrefix: MiddlewareHandler | string,
		...rest: Array<MiddlewareHandler | IRouter>
	): this {
		if (typeof fnOrPrefix === "function") {
			registerMiddleware(this.middlewares, this.errorMiddlewares, fnOrPrefix);
			return this;
		}

		if (typeof fnOrPrefix !== "string") {
			throw new TypeError(
				"[Subatom] app.use: first argument must be a path string or a middleware function.",
			);
		}

		const prefix = fnOrPrefix;

		if (rest.length === 0) {
			throw new TypeError(
				`[Subatom] app.use("${prefix}", ...): expected at least one middleware function or Router after the path.`,
			);
		}

		for (const handler of rest) {
			if (isRouterInstance(handler)) {
				mergeSubRouter(this.router, prefix, handler);
			} else if (typeof handler === "function") {
				this.router.use(prefix, handler);
			} else {
				throw new TypeError(
					`[Subatom] app.use("${prefix}", ...): each argument after the path must be ` +
						`a middleware function or a Router instance, got ${typeof handler}.`,
				);
			}
		}

		return this;
	}

	// 4. Request and response transformer method.
	public transformer(transformer: ITransformer): this {
		registerTransformer(this.transformers, transformer);
		return this;
	}

	// 5. intercept and muted request and response
	public intercept(interceptor: IInterceptor): this {
		registerInterceptor(this.interceptors, interceptor);
		return this;
	}

	// 6. serialize response method.
	public serializer(serializer: ISerializer): this {
		registerSerializer(this.serializers, serializer);
		return this;
	}

	// 7. Create group of a router.
	public group(prefix: string, router: IRouter): this;
	public group(prefix: string, options: IGroupOptions): this;
	public group(prefix?: string): RouteGroupBuilder;
	public group(
		prefix?: string,
		optionsOrRouter?: IGroupOptions | IRouter,
	): this | RouteGroupBuilder {
		if (isRouterInstance(optionsOrRouter)) {
			return dispatchGroup(this, this.router, prefix, optionsOrRouter) as this;
		}
		if (
			typeof prefix === "string" &&
			optionsOrRouter &&
			typeof optionsOrRouter === "object"
		) {
			this.router.group(prefix, optionsOrRouter);
			return this;
		}
		return dispatchGroup(
			this,
			this.router,
			prefix,
		) as unknown as RouteGroupBuilder;
	}

	// 8. Create resource router.
	public resource(
		basePath: string,
		optionsOrController: IResourceOptions | IResourceController,
		legacyOptions?: IResourceOptions,
	): this {
		this.router.resource(basePath, optionsOrController, legacyOptions);
		return this;
	}

	// 9. Global error handler.
	public useError(handler: ErrorMiddlewareHandler): this {
		this.errorMiddlewares.push(handler);
		return this;
	}

	// 10. Http get method.
	public get<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	public get(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;
	public get(path: string, ...args: Array<RouteArgument>): this {
		registerPossiblyGrouped(
			this.router,
			this._currentGroupContext(),
			"GET",
			path,
			args,
		);
		return this;
	}

	// 11. Http post method.
	public post<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	public post(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;
	public post(path: string, ...args: Array<RouteArgument>): this {
		registerPossiblyGrouped(
			this.router,
			this._currentGroupContext(),
			"POST",
			path,
			args,
		);
		return this;
	}

	// 12. Http put method.
	public put<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	public put(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;
	public put(path: string, ...args: Array<RouteArgument>): this {
		registerPossiblyGrouped(
			this.router,
			this._currentGroupContext(),
			"PUT",
			path,
			args,
		);
		return this;
	}

	// 13. Http patch method.
	public patch<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	public patch(
		path: string,
		...args: Array<IHandler | IRouteMetaOptions>
	): this;
	public patch(path: string, ...args: Array<RouteArgument>): this {
		registerPossiblyGrouped(
			this.router,
			this._currentGroupContext(),
			"PATCH",
			path,
			args,
		);
		return this;
	}

	// 14. Http delete method
	public delete<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	public delete(
		path: string,
		...args: Array<IHandler | IRouteMetaOptions>
	): this;
	public delete(path: string, ...args: Array<RouteArgument>): this {
		registerPossiblyGrouped(
			this.router,
			this._currentGroupContext(),
			"DELETE",
			path,
			args,
		);
		return this;
	}

	// 16. Server start method
	public async start(overrideConfig?: ISubatomServerConfig) {
		this.serverInstance = ensureServerInstance(
			this.serverInstance,
			this.router,
			this.middlewares,
			this.errorMiddlewares,
			this.customConfig,
			this.wsRoutes,
		);
		(
			this.serverInstance as SubatomServer & {
				setPipelineConfig?: (config: IRequestPipelineConfig) => void;
			}
		).setPipelineConfig?.(this._getPipelineConfig());
		return await this.serverInstance.start(overrideConfig);
	}

	// 17. Listen server.
	public listen(port: number = 8080, host?: string, appName?: string) {
		this.serverInstance = ensureServerInstance(
			this.serverInstance,
			this.router,
			this.middlewares,
			this.errorMiddlewares,
			this.customConfig,
			this.wsRoutes,
		);
		(
			this.serverInstance as SubatomServer & {
				setPipelineConfig?: (config: IRequestPipelineConfig) => void;
			}
		).setPipelineConfig?.(this._getPipelineConfig());
		return this.serverInstance.listen(port, host, appName);
	}

	// 18. Graceful shutdown method.
	public gracefulShutdown(exitCode: number = 0): void {
		if (typeof this.unregisterProcessBoundary === "function") {
			this.unregisterProcessBoundary();
		}
		performGracefulShutdown(this.serverInstance, exitCode);
	}

	public getRoutes(): IRoute[] {
		return this.router.getRoutes();
	}

	/** @internal */
	public _currentGroupContext(): IGroupContext | undefined {
		return this.groupContextStack[this.groupContextStack.length - 1];
	}

	/** @internal */
	public _pushGroupContext(context: IGroupContext): void {
		this.groupContextStack.push(context);
	}

	/** @internal */
	public _popGroupContext(): void {
		this.groupContextStack.pop();
	}

	/** @internal */
	public _registerGroupRoute(
		method: HttpMethod,
		fullPath: string,
		handlers: IHandler[],
		meta: IRouteMetaOptions,
	): void {
		registerGroupRoute(this.router, method, fullPath, handlers, meta);
	}

	/** @internal */
	public _getPipelineConfig(): IRequestPipelineConfig {
		return {
			transformers: [...this.transformers],
			interceptors: [...this.interceptors],
			serializers: [...this.serializers],
		};
	}
}

export type { IPipelineContext, ISubatom };
