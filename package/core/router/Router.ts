// subatom/package/core/router/Router.ts

import { getOrCreateContext } from "../context/Context.js";
import type {
  IInterceptor,
  ISerializer,
  ITransformer,
} from "../../types/framework/pipeline/IPipeline.js";
import type {
  IResourceController,
  IResourceOptions,
} from "../../types/framework/router/IResourceRouter.js";
import type {
  IGroupOptions,
  IHandler,
  IMatchResult,
  IRoute,
  IRouteMetaOptions,
  IRouteOptions,
  IRouteSchema,
  IRouter,
  RouteArgument,
} from "../../types/framework/router/IRouter.js";
import type {
  IContext,
  IController,
  IContextMiddleware,
  ILegacyHandler,
  IRouteMiddleware,
} from "../../types/context/IContext.js";
import type { IRequest } from "../../types/http/IRequest.js";
import type { IResponse } from "../../types/http/IResponse.js";
import type { NextFunction } from "../../types/framework/pipeline/INext.js";
import { uuid } from "../helpers/framework/uuid.js";
import {
  MethodNotAllowedError,
  NotFoundError,
  normalizeError,
} from "../http/errors/Error.js";
import { ErrorFormatter } from "../http/errors/errorFormatter.js";
import type { IRequestPipelineConfig } from "../pipeline/modifier/RequestPipeline.js";
import {
  registerInterceptor,
  registerSerializer,
  registerTransformer,
} from "../pipeline/modifier/services/pipelineRegistrar.service.js";
import { Next } from "../pipeline/next-pipeline/Next.js";
import { buildRequestValidator } from "../validation/RequestValidator.js";
import { buildUrl } from "./helpers/buildUrl.js";
import isRouterInstance from "./helpers/isRouterInstance.js";
import { isRouteOptions, parseRouteArgs } from "./helpers/parseRouteArgs.js";
import { buildResourceRoutes } from "./helpers/resourceRouteBuilder.js";

const MIDDLEWARE_METHOD = "USE";
const WILDCARD_METHOD = "ALL";
const QUERY_METHOD = "QUERY";

export type { IRouter };

/**
 * Checks if a value is the Context or HTTP request/response object to avoid auto-serializing it.
 */
function isContextOrHttpInstance(
  val: unknown,
  ctx: IContext,
  req: IRequest,
  res: IResponse,
): boolean {
  return (
    val === ctx ||
    val === res ||
    val === req ||
    val === (ctx as any)?.req ||
    val === (ctx as any)?.res ||
    val === (req as any)?.raw ||
    val === (res as any)?.raw
  );
}

/**
 * Adapts context middlewares or legacy request/response handlers to an internal IHandler.
 */
function normalizeMiddlewareToHandler(mw: IRouteMiddleware): IHandler {
  return async (req: IRequest, res: IResponse, next: NextFunction) => {
    if (mw.length >= 3) {
      return (mw as ILegacyHandler)(req, res, next);
    }
    const ctx = getOrCreateContext(req, res);
    return (mw as IContextMiddleware)(ctx, next);
  };
}

/**
 * Wraps a context controller into an internal IHandler.
 */
function createControllerHandler(
  controller: IController<any, any, any, any>,
): IHandler {
  return async (req: IRequest, res: IResponse, next: NextFunction) => {
    if (res.writableEnded || res.headersSent) return;
    const ctx = getOrCreateContext(req, res);
    try {
      const result = await controller(ctx);
      if (
        result !== undefined &&
        !res.writableEnded &&
        !res.headersSent &&
        !isContextOrHttpInstance(result, ctx, req, res)
      ) {
        if (
          typeof result === "object" &&
          result !== null &&
          !(result instanceof Buffer) &&
          !(result instanceof Uint8Array)
        ) {
          ctx.json(result);
        } else if (
          typeof result === "string" ||
          typeof result === "number" ||
          typeof result === "boolean"
        ) {
          ctx.send(String(result));
        }
      }
    } catch (err) {
      return next(err);
    }
  };
}

export class Router implements IRouter {
  protected routes: IRoute[] = [];

  private readonly transformers: ITransformer[] = [];
  private readonly interceptors: IInterceptor[] = [];
  private readonly serializers: ISerializer[] = [];

  public transformer(transformer: ITransformer): void {
    registerTransformer(this.transformers, transformer);
  }

  public intercept(interceptor: IInterceptor): void {
    registerInterceptor(this.interceptors, interceptor);
  }

  public serializer(serializer: ISerializer): void {
    registerSerializer(this.serializers, serializer);
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

  public get<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  public get(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;
  public get(path: string, ...args: any[]): this {
    this.registerMethod("GET", path, args);
    return this;
  }

  public post<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  public post(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;
  public post(path: string, ...args: any[]): this {
    this.registerMethod("POST", path, args);
    return this;
  }

  public put<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  public put(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;
  public put(path: string, ...args: any[]): this {
    this.registerMethod("PUT", path, args);
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
    this.registerMethod("PATCH", path, args);
    return this;
  }

  public delete<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  public delete(
    path: string,
    ...args: Array<IHandler | IRouteMetaOptions>
  ): this;
  public delete(path: string, ...args: any[]): this {
    this.registerMethod("DELETE", path, args);
    return this;
  }

  public options<
    TSchema extends IRouteSchema = IRouteSchema,
    TReturn = unknown,
  >(path: string, options: IRouteOptions<TSchema, any, any, TReturn>): this;
  public options(
    path: string,
    ...args: Array<IHandler | IRouteMetaOptions>
  ): this;
  public options(path: string, ...args: any[]): this {
    this.registerMethod("OPTIONS", path, args);
    return this;
  }

  public head<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  public head(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;
  public head(path: string, ...args: any[]): this {
    this.registerMethod("HEAD", path, args);
    return this;
  }

  public trace<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  public trace(
    path: string,
    ...args: Array<IHandler | IRouteMetaOptions>
  ): this;
  public trace(path: string, ...args: any[]): this {
    this.registerMethod("TRACE", path, args);
    return this;
  }

  public connect<
    TSchema extends IRouteSchema = IRouteSchema,
    TReturn = unknown,
  >(path: string, options: IRouteOptions<TSchema, any, any, TReturn>): this;
  public connect(
    path: string,
    ...args: Array<IHandler | IRouteMetaOptions>
  ): this;
  public connect(path: string, ...args: any[]): this {
    this.registerMethod("CONNECT", path, args);
    return this;
  }

  public query<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  public query(
    path: string,
    ...args: Array<IHandler | IRouteMetaOptions>
  ): this;
  public query(path: string, ...args: any[]): this {
    this.registerMethod(QUERY_METHOD, path, args);
    return this;
  }

  public all<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  public all(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;
  public all(path: string, ...args: any[]): this {
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
  // Groups (Style 1 and Style 2)
  // ============================================================

  public group(prefix: string, options?: IGroupOptions): this;
  public group(prefix: string, routesCallback: (router: IRouter) => void): this;
  public group(
    prefix: string,
    optionsOrRoutes?: IGroupOptions | ((router: IRouter) => void),
  ): any {
    const cleanPrefix = ("/" + (prefix || ""))
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
          return (...fnArgs: any[]) => {
            const result = orig.apply(target, fnArgs);
            applyGroupInheritanceAndMount();
            return result === target ? receiver : result;
          };
        }
        return orig;
      },
    };

    return new Proxy(childRouter, proxyHandler);
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

    if (
      optionsOrController &&
      typeof optionsOrController === "object" &&
      "controller" in optionsOrController &&
      optionsOrController.controller
    ) {
      options = optionsOrController as IResourceOptions;
      controller = options.controller!;
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
    pathOrHandler: string | IHandler | IRouteMiddleware | Router,
    ...handlers: Array<IHandler | IRouteMiddleware | Router>
  ): void {
    if (typeof pathOrHandler === "string") {
      const path = pathOrHandler;
      for (const h of handlers) {
        if (isRouterInstance(h)) {
          this.mountSubRouter(path, h);
        } else if (typeof h === "function") {
          this.register_route(MIDDLEWARE_METHOD, path, [
            normalizeMiddlewareToHandler(h),
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
        ...handlers.filter((h) => typeof h === "function"),
      ].map(normalizeMiddlewareToHandler);
      this.register_route(MIDDLEWARE_METHOD, "/", allHandlers);
    } else if (isRouterInstance(pathOrHandler)) {
      this.mountSubRouter("/", pathOrHandler);
    } else {
      throw new TypeError(
        "[Subatom] Router.use: first argument must be a string path, a handler function, or a Router instance.",
      );
    }
  }

  private mountSubRouter(mountPath: string, subRouter: Router): void {
    const cleanMount = ("/" + mountPath)
      .replace(/\/+/g, "/")
      .replace(/\/$/, "");

    for (const route of subRouter.getRoutes()) {
      const suffix = route.path === "/" ? "" : route.path;
      const combinedPath = (cleanMount + suffix).replace(/\/+/g, "/") || "/";

      this.routes.push({
        ...route,
        path: combinedPath,
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

    const cleanPath = ("/" + (path || "/")).replace(/\/+/g, "/");
    const finalHandlers = [...handlers];

    // Validation Injection: schema validator runs right before controller
    if (meta?.schema) {
      const validatorMw = buildRequestValidator(meta.schema);
      if (finalHandlers.length > 0) {
        const controller = finalHandlers.pop()!;
        finalHandlers.push(validatorMw, controller);
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

    if (options.prefix) {
      if (routeSegments.length > incomingSegments.length) return null;
    } else if (routeSegments.length !== incomingSegments.length) {
      return null;
    }

    const params: Record<string, string> = Object.create(null);

    for (let i = 0; i < routeSegments.length; i++) {
      const routeSeg = routeSegments[i];
      const incomingSeg = incomingSegments[i];

      if (!routeSeg || !incomingSeg) return null;

      if (routeSeg.startsWith(":")) {
        const paramName = routeSeg.slice(1);
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
