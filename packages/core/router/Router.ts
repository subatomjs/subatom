/**
 * @fileoverview Core Router implementation handling route registration, grouping,
 * middleware, resources, matching, request dispatch, pipelines, and URL generation.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { ErrorFormatter } from "../../errors/ErrorFormatter.js";
import {
	MethodNotAllowedError,
	normalizeError,
	NotFoundError,
} from "../../errors/Errors.js";
import type { IRequest } from "../../core/http/request/types/request.types.js";
import type { IResponse } from "../../core/http/response/types/response.types.js";
import { uuid } from "../../methods/uuid.js";
import {
	registerInterceptor,
	registerSerializer,
	registerTransformer,
} from "../../pipelines/modifiers/services/pipelineRegistrar.service.js";
import type { IRequestPipelineConfig } from "../../pipelines/modifiers/types/modifiers.types.js";
import { Next } from "../../pipelines/next/Next.js";

import type {
	IInterceptor,
	ISerializer,
	ITransformer,
} from "../../pipelines/pipeline.types.js";
import { buildRequestValidator } from "../../validations/RequestValidator.js";
import { buildUrl } from "./helpers/buildUrl.js";
import isRouterInstance from "./helpers/isRouterInstance.js";
import { isRouteOptions, parseRouteArgs } from "./helpers/parseRouteArgs.js";
import { buildResourceRoutes } from "./helpers/resourceRouteBuilder.js";
import type {
	IResourceController,
	IResourceOptions,
} from "./types/resource.router.types.js";
import type {
	IGroupOptions,
	IHandler,
	IMatchResult,
	IRoute,
	IRouteMetaOptions,
	IRouteMiddleware,
	IRouteOptions,
	IRouter,
	IRouteSchema,
	RouteArgument,
} from "./types/router.types.js";
import normalizeMiddlewareToHandler from "./helpers/normalizeMiddleware.js";
import createControllerHandler from "./helpers/createControllerHandler.js";

const MIDDLEWARE_METHOD = "USE";
const WILDCARD_METHOD = "ALL";
const QUERY_METHOD = "QUERY";

export class Router implements IRouter {
	protected routes: IRoute[] = [];

	private readonly transformers: ITransformer[] = [];
	private readonly interceptors: IInterceptor[] = [];
	private readonly serializers: ISerializer[] = [];

	public transformer(transformer: ITransformer): void {
		registerTransformer(this.transformers, transformer);
		// Update existing routes to inherit the newly registered transformer
		for (const route of this.routes) {
			if (!route.routerPipeline) {
				route.routerPipeline = this.getPipelineConfig();
			}
		}
	}

	public intercept(interceptor: IInterceptor): void {
		registerInterceptor(this.interceptors, interceptor);
		for (const route of this.routes) {
			if (!route.routerPipeline) {
				route.routerPipeline = this.getPipelineConfig();
			}
		}
	}

	public serializer(serializer: ISerializer): void {
		registerSerializer(this.serializers, serializer);
		for (const route of this.routes) {
			if (!route.routerPipeline) {
				route.routerPipeline = this.getPipelineConfig();
			}
		}
	}

	public getPipelineConfig(): IRequestPipelineConfig {
		return {
			transformers: this.transformers,
			interceptors: this.interceptors,
			serializers: this.serializers,
		};
	}

	// ============================================================
	// Verb Registration
	// ============================================================

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
		this.registerMethod("GET", path, args);
		return this;
	}

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
		this.registerMethod("POST", path, args);
		return this;
	}

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
		this.registerMethod("PUT", path, args);
		return this;
	}

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
		this.registerMethod("PATCH", path, args);
		return this;
	}

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
		this.registerMethod("DELETE", path, args);
		return this;
	}

	public options<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	public options(
		path: string,
		...args: Array<IHandler | IRouteMetaOptions>
	): this;
	public options(path: string, ...args: Array<RouteArgument>): this {
		this.registerMethod("OPTIONS", path, args);
		return this;
	}

	public head<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	public head(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;
	public head(path: string, ...args: Array<RouteArgument>): this {
		this.registerMethod("HEAD", path, args);
		return this;
	}

	public trace<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	public trace(
		path: string,
		...args: Array<IHandler | IRouteMetaOptions>
	): this;
	public trace(path: string, ...args: Array<RouteArgument>): this {
		this.registerMethod("TRACE", path, args);
		return this;
	}

	public connect<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	public connect(
		path: string,
		...args: Array<IHandler | IRouteMetaOptions>
	): this;
	public connect(path: string, ...args: Array<RouteArgument>): this {
		this.registerMethod("CONNECT", path, args);
		return this;
	}

	public query<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	public query(
		path: string,
		...args: Array<IHandler | IRouteMetaOptions>
	): this;
	public query(path: string, ...args: Array<RouteArgument>): this {
		this.registerMethod(QUERY_METHOD, path, args);
		return this;
	}

	public all<
		TSchema extends IRouteSchema = IRouteSchema,
		TLocals extends Record<string, unknown> = Record<string, unknown>,
		TUser = unknown,
		TReturn = unknown,
	>(
		path: string,
		options: IRouteOptions<TSchema, TLocals, TUser, TReturn>,
	): this;
	public all(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;
	public all(path: string, ...args: Array<RouteArgument>): this {
		this.registerMethod(WILDCARD_METHOD, path, args);
		return this;
	}

	private registerMethod(
		method: string,
		path: string,
		args: Array<RouteArgument>,
	): void {
		if (args.length === 1 && isRouteOptions(args[0])) {
			const opts = args[0] as IRouteOptions;
			const middlewareFns = (opts.middleware || []).map(
				normalizeMiddlewareToHandler,
			);
			const controllerFn = createControllerHandler(opts.controller);
			const handlers = [...middlewareFns, controllerFn];

			const meta: IRouteMetaOptions = {};
			if (opts.name !== undefined) meta.name = opts.name;
			if (opts.tags !== undefined) meta.tags = opts.tags;
			if (opts.rateLimit !== undefined) meta.rateLimit = opts.rateLimit;
			if (opts.schema !== undefined) meta.schema = opts.schema;

			this.registerWithMeta(method, path, handlers, meta);
			return;
		}

		const { handlers, options } = parseRouteArgs(args);
		this.registerWithMeta(method, path, handlers, options);
	}

	// ============================================================
	// Groups
	// ============================================================

	public group(prefix: string, options?: IGroupOptions): this;
	public group(prefix: string, routesCallback: (router: IRouter) => void): this;
	public group(
		prefix: string,
		optionsOrRoutes?: IGroupOptions | ((router: IRouter) => void),
	): this {
		const cleanPrefix = `/${prefix || ""}`
			.replace(/\/+/g, "/")
			.replace(/\/$/, "");
		const childRouter = new Router();

		let options: IGroupOptions = {};
		if (typeof optionsOrRoutes === "function") {
			options = { routes: optionsOrRoutes };
		} else if (optionsOrRoutes && typeof optionsOrRoutes === "object") {
			options = optionsOrRoutes;
		}

		const groupMiddlewares = (options.middleware || []).map(
			normalizeMiddlewareToHandler,
		);
		const groupTags = options.tags || [];
		const groupRateLimit = options.rateLimit;
		const groupNamePrefix = options.name;

		const applyGroupInheritanceAndMount = () => {
			for (const route of childRouter.getRoutes()) {
				const routeSuffix = route.path === "/" ? "" : route.path;
				const combinedPath =
					(cleanPrefix + routeSuffix).replace(/\/+/g, "/") || "/";

				const mergedMiddlewares = [...groupMiddlewares, ...route.handlers];
				const mergedTags = Array.from(
					new Set([...groupTags, ...(route.tags || [])]),
				);
				const effectiveRateLimit = route.rateLimit ?? groupRateLimit;

				let effectiveName = route.name;
				if (
					groupNamePrefix &&
					route.name &&
					!route.name.startsWith(groupNamePrefix)
				) {
					effectiveName = `${groupNamePrefix}.${route.name}`;
				}

				const newRoute: IRoute = {
					...route,
					path: combinedPath,
					handlers: mergedMiddlewares,
					routerPipeline: route.routerPipeline || this.getPipelineConfig(),
				};

				if (mergedTags.length > 0) {
					newRoute.tags = mergedTags;
				}
				if (effectiveRateLimit !== undefined) {
					newRoute.rateLimit = effectiveRateLimit;
				}
				if (effectiveName !== undefined) {
					newRoute.name = effectiveName;
				}

				this.routes.push(newRoute);
			}
			childRouter.clearRoutes();
		};

		if (typeof options.routes === "function") {
			options.routes(childRouter);
			applyGroupInheritanceAndMount();
			return this;
		}

		const proxyHandler: ProxyHandler<Router> = {
			get: (target, prop, receiver) => {
				const orig = Reflect.get(target, prop, receiver);
				if (typeof orig === "function") {
					return (...fnArgs: unknown[]) => {
						const result = orig.apply(target, fnArgs);
						applyGroupInheritanceAndMount();
						return result === target ? receiver : result;
					};
				}
				return orig;
			},
		};

		return new Proxy(childRouter, proxyHandler) as unknown as this;
	}

	// ============================================================
	// Resource Routing
	// ============================================================

	public resource(
		basePath: string,
		optionsOrController: IResourceOptions | IResourceController,
		legacyOptions: IResourceOptions = {},
	): void {
		let controller: IResourceController;
		let options: IResourceOptions;

		const maybeOpts = optionsOrController as IResourceOptions;
		if (
			optionsOrController &&
			typeof optionsOrController === "object" &&
			"controller" in optionsOrController &&
			typeof maybeOpts.controller === "object" &&
			maybeOpts.controller !== null
		) {
			options = maybeOpts;
			controller = maybeOpts.controller;
		} else {
			controller = optionsOrController as IResourceController;
			options = legacyOptions;
		}

		const routeDefs = buildResourceRoutes(basePath, controller, options);
		for (const def of routeDefs) {
			this.registerWithMeta(def.method, def.path, def.handlers, def.meta);
		}
	}

	// ============================================================
	// Use / Sub-Router Mounting
	// ============================================================

	public use(
		pathOrHandler: string | IHandler | IRouteMiddleware | IRouter,
		...handlers: Array<IHandler | IRouteMiddleware | IRouter>
	): void {
		if (typeof pathOrHandler === "string") {
			const path = pathOrHandler;
			for (const h of handlers) {
				if (isRouterInstance(h)) {
					this.mountSubRouter(path, h);
				} else if (typeof h === "function") {
					this.register_route(MIDDLEWARE_METHOD, path, [
						normalizeMiddlewareToHandler(h as IRouteMiddleware),
					]);
				} else {
					throw new TypeError(
						"[Subatom] Router.use: expected a handler function or a Router instance.",
					);
				}
			}
		} else if (typeof pathOrHandler === "function") {
			const allHandlers = [
				pathOrHandler,
				...handlers.filter(
					(h): h is IHandler | IRouteMiddleware => typeof h === "function",
				),
			].map((h) => normalizeMiddlewareToHandler(h as IRouteMiddleware));
			this.register_route(MIDDLEWARE_METHOD, "/", allHandlers);
		} else if (isRouterInstance(pathOrHandler)) {
			this.mountSubRouter("/", pathOrHandler);
		} else {
			throw new TypeError(
				"[Subatom] Router.use: first argument must be a string path, a handler function, or a Router instance.",
			);
		}
	}

	private mountSubRouter(mountPath: string, subRouter: IRouter): void {
		const cleanMount = `/${mountPath}`.replace(/\/+/g, "/").replace(/\/$/, "");

		for (const route of subRouter.getRoutes()) {
			const suffix = route.path === "/" ? "" : route.path;
			const combinedPath = (cleanMount + suffix).replace(/\/+/g, "/") || "/";

			this.routes.push({
				...route,
				path: combinedPath,
				routerPipeline: route.routerPipeline || subRouter.getPipelineConfig?.(),
			});
		}
	}

	// ============================================================
	// Route Table Access & Registration
	// ============================================================

	public getRoutes(): IRoute[] {
		return this.routes;
	}

	public clearRoutes(): void {
		this.routes = [];
	}

	public registerWithMeta(
		method: string,
		path: string,
		handlers: IHandler[],
		meta?: IRouteMetaOptions,
	): void {
		if (!method || typeof method !== "string") {
			throw new TypeError(
				"[Subatom] Router.registerWithMeta: 'method' must be a non-empty string.",
			);
		}

		if (!Array.isArray(handlers) || handlers.length === 0) {
			throw new TypeError(
				`[Subatom] Router.registerWithMeta: route "${method.toUpperCase()} ${
					path || "/"
				}" requires at least one handler function.`,
			);
		}

		for (const handler of handlers) {
			if (typeof handler !== "function") {
				throw new TypeError(
					`[Subatom] Router.registerWithMeta: route "${method.toUpperCase()} ${
						path || "/"
					}" received a non-function handler.`,
				);
			}
		}

		if (meta?.name) {
			const existing = this.findRouteByName(meta.name);
			if (existing) {
				throw new TypeError(
					`[Subatom] Route name "${meta.name}" is already registered ` +
						`(${existing.method} ${existing.path}). Route names must be unique within a Router.`,
				);
			}
		}

		const cleanPath = `/${path || "/"}`.replace(/\/+/g, "/");
		const finalHandlers = [...handlers];

		if (meta?.schema) {
			const validatorMw = buildRequestValidator(meta.schema);
			if (finalHandlers.length > 0) {
				const controller = finalHandlers.pop();
				if (controller) {
					finalHandlers.push(validatorMw, controller);
				} else {
					finalHandlers.push(validatorMw);
				}
			} else {
				finalHandlers.push(validatorMw);
			}
		}

		const route: IRoute = {
			method: method.toUpperCase(),
			path: cleanPath,
			handlers: finalHandlers,
			routerPipeline: this.getPipelineConfig(),
		};

		route.name = meta?.name || uuid.short(8);

		if (meta?.tags && meta.tags.length > 0) {
			route.tags = meta.tags;
		}

		if (meta?.rateLimit !== undefined) {
			route.rateLimit = meta.rateLimit;
		}

		if (meta?.schema !== undefined) {
			route.schema = meta.schema;
		}

		this.routes.push(route);
	}

	public findRouteByName(name: string): IRoute | undefined {
		return this.routes.find((route) => route.name === name);
	}

	public hasRoute(name: string): boolean {
		return this.findRouteByName(name) !== undefined;
	}

	// ============================================================
	// Matching & Dispatching
	// ============================================================

	public match(
		method: string = "GET",
		rawUrl: string = "/",
	): IMatchResult | undefined {
		const pathName = this.extractPathname(rawUrl);
		const query = this.extractQuery(rawUrl);
		const targetMethod = (method || "GET").toUpperCase();

		for (const route of this.routes) {
			if (route.method === MIDDLEWARE_METHOD) continue;
			if (route.method !== targetMethod && route.method !== WILDCARD_METHOD)
				continue;

			const params = this.matchPath(route.path, pathName);
			if (params !== null) {
				return { route, params, query };
			}
		}

		return undefined;
	}

	public async dispatch(
		req: IRequest,
		res: IResponse,
		globalMiddlewares: IHandler[] = [],
	): Promise<void> {
		const pathName = this.extractPathname(req.url || "/");
		const method = req.method || "GET";

		const { handlers: useMiddlewares, params: useParams } =
			this.collectUseMiddlewares(pathName);

		const matchResult = this.match(method, req.url || "/");

		if (!matchResult) {
			const pathExists = this.routes.some(
				(r) =>
					r.method !== MIDDLEWARE_METHOD &&
					this.matchPath(r.path, pathName) !== null,
			);

			if (pathExists) {
				throw new MethodNotAllowedError(
					`Method ${method} not allowed on ${req.path}`,
				);
			}

			throw new NotFoundError(`Cannot ${method} ${req.path}`);
		}

		req.params = { ...useParams, ...matchResult.params };
		req.query = matchResult.query;

		const pipeline = [
			...globalMiddlewares,
			...useMiddlewares,
			...matchResult.route.handlers,
		];

		await this.runPipeline(pipeline, req, res);
	}

	public async handleRequest(
		req: IRequest,
		res: IResponse,
		globalMiddlewares: IHandler[] = [],
	): Promise<void> {
		try {
			await this.dispatch(req, res, globalMiddlewares);
		} catch (err: unknown) {
			if (res.writableEnded) {
				console.error(
					"[Subatom Error]: Unhandled error occurred after the response was already sent.",
					err,
				);
				return;
			}
			ErrorFormatter.handle(normalizeError(err), req, res);
		}
	}

	private async runPipeline(
		handlers: IHandler[],
		req: IRequest,
		res: IResponse,
	): Promise<void> {
		const pipeline = new Next(handlers, req, res);
		await pipeline.run();
	}

	private collectUseMiddlewares(pathName: string): {
		handlers: IHandler[];
		params: Record<string, string>;
	} {
		const handlers: IHandler[] = [];
		const params: Record<string, string> = Object.create(null);

		for (const route of this.routes) {
			if (route.method !== MIDDLEWARE_METHOD) continue;

			const matched = this.matchPath(route.path, pathName, { prefix: true });
			if (matched !== null) {
				Object.assign(params, matched);
				handlers.push(...route.handlers);
			}
		}

		return { handlers, params };
	}

	private extractPathname(rawUrl: string): string {
		const queryIndex = rawUrl.indexOf("?");
		const pathPart = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);
		return pathPart || "/";
	}

	private extractQuery(rawUrl: string): Record<string, string> {
		const queryIndex = rawUrl.indexOf("?");
		const queryString = queryIndex === -1 ? "" : rawUrl.slice(queryIndex + 1);
		const searchParams = new URLSearchParams(queryString);
		return Object.fromEntries(searchParams.entries());
	}

	private matchPath(
		routePath: string,
		incomingPath: string,
		options: { prefix?: boolean } = {},
	): Record<string, string> | null {
		const routeSegments = routePath.split("/").filter(Boolean);
		const incomingSegments = incomingPath.split("/").filter(Boolean);

		const requiredSegmentsCount = routeSegments.filter(
			(seg) => !(seg.startsWith(":") && seg.endsWith("?")),
		).length;

		if (options.prefix) {
			if (incomingSegments.length < requiredSegmentsCount) return null;
		} else if (
			incomingSegments.length < requiredSegmentsCount ||
			incomingSegments.length > routeSegments.length
		) {
			return null;
		}

		const params: Record<string, string> = Object.create(null);

		for (let i = 0; i < routeSegments.length; i++) {
			const routeSeg = routeSegments[i];
			const incomingSeg = incomingSegments[i];

			if (!routeSeg) return null;

			const isOptionalParam =
				routeSeg.startsWith(":") && routeSeg.endsWith("?");
			const isRequiredParam =
				routeSeg.startsWith(":") && !routeSeg.endsWith("?");

			if (isOptionalParam && !incomingSeg) {
				continue;
			}

			if (!incomingSeg) {
				return null;
			}

			if (isOptionalParam || isRequiredParam) {
				const paramName = isOptionalParam
					? routeSeg.slice(1, -1)
					: routeSeg.slice(1);

				if (!paramName) return null;

				try {
					params[paramName] = decodeURIComponent(incomingSeg);
				} catch {
					return null;
				}
			} else if (routeSeg !== incomingSeg) {
				return null;
			}
		}

		return params;
	}

	public urlFor(
		name: string,
		params: Record<string, string | number> = {},
		query?: Record<string, string | number | boolean>,
	): string {
		const route = this.findRouteByName(name);
		if (!route) {
			throw new Error(
				`[Subatom] urlFor: no route registered with name "${name}".`,
			);
		}
		return buildUrl(route.path, params, query);
	}

	private register_route(
		method: string,
		path: string,
		handlers: IHandler[],
		options?: IRouteMetaOptions,
	): void {
		this.registerWithMeta(method, path, handlers, options);
	}
}

export type { IRouter };
