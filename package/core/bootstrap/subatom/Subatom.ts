import { configEnv } from "../../../config/env/env.js";
import type { EnvOptions } from "../../../types/config/EnvOptions.js";
import type {
	IGroupContext,
	ISubatomServerConfig,
} from "../../../types/framework/core/IFrameworkCore.js";
import type {
	IInterceptor,
	IPipelineContext,
	ISerializer,
	ITransformer,
} from "../../../types/framework/pipeline/IPipeline.js";
import type {
	IResourceController,
	IResourceOptions,
} from "../../../types/framework/router/IResourceRouter.js";
import type {
	IGroupOptions,
	IHandler,
	IRouteMetaOptions,
	IRouteOptions,
	IRouteSchema,
	IRouter,
} from "../../../types/framework/router/IRouter.js";
import type {
	ErrorMiddlewareHandler,
	MiddlewareHandler,
} from "../../../types/http/IMiddleware.js";
import type {
	IWebSocketHandlers,
	IWebSocketRoute,
} from "../../../types/websocket/IWebSocket.js";
import type { IRequestPipelineConfig } from "../../pipeline/modifier/RequestPipeline.js";
import {
	registerInterceptor,
	registerSerializer,
	registerTransformer,
} from "../../pipeline/modifier/services/pipelineRegistrar.service.js";
import { Router } from "../../router/Router.js";
import {
	registerGroupRoute,
	registerPossiblyGrouped,
} from "../../router/services/routeRegistrar.service.js";
import { mergeSubRouter } from "../../router/services/routerMerger.service.js";
import type { SubatomServer } from "../subatom-server/SubatomServer.js";
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

export class Subatom {
	private readonly router = new Router();
	private readonly middlewares: MiddlewareHandler[] = [];
	private readonly errorMiddlewares: ErrorMiddlewareHandler[] = [];
	private readonly wsRoutes: IWebSocketRoute[] = [];
	private serverInstance?: SubatomServer;
	private customConfig: ISubatomServerConfig = {};

	private readonly transformers: ITransformer[] = [];
	private readonly interceptors: IInterceptor[] = [];
	private readonly serializers: ISerializer[] = [];

	private readonly groupContextStack: IGroupContext[] = [];
	private readonly unregisterProcessBoundary?: () => void;

	constructor(envOptions?: EnvOptions) {
		configEnv(envOptions);
		const unreg = registerProcessBoundary(
			() => this.serverInstance,
			(exitCode) => this.gracefulShutdown(exitCode),
		);
		if (typeof unreg === "function") {
			this.unregisterProcessBoundary = unreg;
		}
	}

	public ws<
		TParams extends Record<string, string | undefined> = Record<
			string,
			string | undefined
		>,
		TQuery extends Record<string, string | undefined> = Record<
			string,
			string | undefined
		>,
		TLocals extends Record<string, any> = Record<string, any>,
	>(
		path: string,
		handlers: IWebSocketHandlers<TParams, TQuery, TLocals>,
	): this {
		const route: IWebSocketRoute = {
			path,
			handlers: handlers as unknown as IWebSocketHandlers,
		};
		this.wsRoutes.push(route);
		if (this.serverInstance) {
			this.serverInstance.webSocket.register(path, handlers);
		}
		return this;
	}

	public setConfig(config: ISubatomServerConfig): this {
		this.customConfig = { ...this.customConfig, ...config };
		if (this.serverInstance) {
			this.serverInstance.setConfig(this.customConfig);
		}
		return this;
	}

	public use(
		fnOrPrefix: MiddlewareHandler | string,
		...rest: Array<MiddlewareHandler | IRouter>
	): this {
		if (typeof fnOrPrefix === "function") {
			registerMiddleware(
				this.middlewares,
				this.errorMiddlewares,
				fnOrPrefix,
			);
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
			if (handler instanceof Router) {
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

	public transformer(transformer: ITransformer): this {
		registerTransformer(this.transformers, transformer);
		return this;
	}

	public intercept(interceptor: IInterceptor): this {
		registerInterceptor(this.interceptors, interceptor);
		return this;
	}

	public serializer(serializer: ISerializer): this {
		registerSerializer(this.serializers, serializer);
		return this;
	}

	public group(prefix: string, router: Router): this;
	public group(prefix: string, options: IGroupOptions): this;
	public group(prefix?: string): RouteGroupBuilder;
	public group(
		prefix?: string,
		optionsOrRouter?: IGroupOptions | Router,
	): this | RouteGroupBuilder {
		if (optionsOrRouter instanceof Router) {
			return dispatchGroup(
				this,
				this.router,
				prefix,
				optionsOrRouter,
			) as this;
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

	public resource(
		basePath: string,
		optionsOrController: IResourceOptions | IResourceController,
		legacyOptions?: IResourceOptions,
	): this {
		this.router.resource(basePath, optionsOrController, legacyOptions);
		return this;
	}

	public useError(handler: ErrorMiddlewareHandler): this {
		this.errorMiddlewares.push(handler);
		return this;
	}

	public get<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
		path: string,
		options: IRouteOptions<TSchema, any, any, TReturn>,
	): this;
	public get(
		path: string,
		...args: Array<IHandler | IRouteMetaOptions>
	): this;
	public get(path: string, ...args: any[]): this {
		registerPossiblyGrouped(
			this.router,
			this._currentGroupContext(),
			"GET",
			path,
			args,
		);
		return this;
	}

	public post<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
		path: string,
		options: IRouteOptions<TSchema, any, any, TReturn>,
	): this;
	public post(
		path: string,
		...args: Array<IHandler | IRouteMetaOptions>
	): this;
	public post(path: string, ...args: any[]): this {
		registerPossiblyGrouped(
			this.router,
			this._currentGroupContext(),
			"POST",
			path,
			args,
		);
		return this;
	}

	public put<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
		path: string,
		options: IRouteOptions<TSchema, any, any, TReturn>,
	): this;
	public put(
		path: string,
		...args: Array<IHandler | IRouteMetaOptions>
	): this;
	public put(path: string, ...args: any[]): this {
		registerPossiblyGrouped(
			this.router,
			this._currentGroupContext(),
			"PUT",
			path,
			args,
		);
		return this;
	}

	public patch<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
		path: string,
		options: IRouteOptions<TSchema, any, any, TReturn>,
	): this;
	public patch(
		path: string,
		...args: Array<IHandler | IRouteMetaOptions>
	): this;
	public patch(path: string, ...args: any[]): this {
		registerPossiblyGrouped(
			this.router,
			this._currentGroupContext(),
			"PATCH",
			path,
			args,
		);
		return this;
	}

	public delete<
		TSchema extends IRouteSchema = IRouteSchema,
		TReturn = unknown,
	>(path: string, options: IRouteOptions<TSchema, any, any, TReturn>): this;
	public delete(
		path: string,
		...args: Array<IHandler | IRouteMetaOptions>
	): this;
	public delete(path: string, ...args: any[]): this {
		registerPossiblyGrouped(
			this.router,
			this._currentGroupContext(),
			"DELETE",
			path,
			args,
		);
		return this;
	}

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

	public gracefulShutdown(exitCode: number = 0): void {
		if (typeof this.unregisterProcessBoundary === "function") {
			this.unregisterProcessBoundary();
		}
		performGracefulShutdown(this.serverInstance, exitCode);
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

export type { IPipelineContext };