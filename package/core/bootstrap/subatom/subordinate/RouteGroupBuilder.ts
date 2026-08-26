import type { IGroupContext } from "../../../../types/framework/core/IFrameworkCore.js";
import type {
  IHandler,
  IRouteOptions,
  IRouteSchema,
} from "../../../../types/framework/router/IRouter.js";
import type { MiddlewareHandler } from "../../../../types/http/IMiddleware.js";
import type { Subatom } from "../Subatom.js";
import { buildGroupContext } from "./services/contextBuilder.service.js";
import { collectMiddlewares } from "./services/middlewareValidator.service.js";
import { appendPrefix } from "./services/pathComposer.service.js";
import { configureRateLimit } from "./services/rateLimitConfig.service.js";
import {
  type HttpMethod,
  registerGroupRoute,
} from "./services/routeRegistrar.service.js";
import { collectTags } from "./services/tagValidator.service.js";

export type { HttpMethod };

export class RouteGroupBuilder {
  private ownPrefix: string;
  private readonly ownMiddlewares: MiddlewareHandler[] = [];
  private readonly ownTags: string[] = [];
  private ownRateLimitSpec: string | undefined;
  private ownRateLimitMiddleware: MiddlewareHandler | undefined;

  constructor(
    private readonly app: Subatom,
    prefix: string = "",
  ) {
    if (typeof prefix !== "string") {
      throw new TypeError("[Subatom] group() prefix must be a string.");
    }
    this.ownPrefix = prefix;
  }

  public prefix(segment: string): this {
    this.ownPrefix = appendPrefix(this.ownPrefix, segment);
    return this;
  }

  public middleware(
    ...handlers: Array<MiddlewareHandler | MiddlewareHandler[]>
  ): this {
    collectMiddlewares(this.ownMiddlewares, ...handlers);
    return this;
  }

  public tag(...tags: Array<string | string[]>): this {
    collectTags(this.ownTags, ...tags);
    return this;
  }

  public rateLimit(spec: string): this {
    const { spec: validatedSpec, middleware } = configureRateLimit(spec);
    this.ownRateLimitSpec = validatedSpec;
    this.ownRateLimitMiddleware = middleware;
    return this;
  }

  public get<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  public get(path: string, ...handlers: IHandler[]): this;
  public get(path: string, ...handlers: any[]): this {
    this.registerDirect("GET", path, handlers);
    return this;
  }

  public post<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  public post(path: string, ...handlers: IHandler[]): this;
  public post(path: string, ...handlers: any[]): this {
    this.registerDirect("POST", path, handlers);
    return this;
  }

  public put<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  public put(path: string, ...handlers: IHandler[]): this;
  public put(path: string, ...handlers: any[]): this {
    this.registerDirect("PUT", path, handlers);
    return this;
  }

  public patch<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  public patch(path: string, ...handlers: IHandler[]): this;
  public patch(path: string, ...handlers: any[]): this {
    this.registerDirect("PATCH", path, handlers);
    return this;
  }

  public delete<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  public delete(path: string, ...handlers: IHandler[]): this;
  public delete(path: string, ...handlers: any[]): this {
    this.registerDirect("DELETE", path, handlers);
    return this;
  }

  public group(callback?: () => void | Promise<void>): this {
    if (callback !== undefined && typeof callback !== "function") {
      throw new TypeError(
        "[Subatom] .group() expects its argument to be a function, if provided.",
      );
    }

    const context = this.buildContext();
    this.app._pushGroupContext(context);

    try {
      if (callback) {
        const maybePromise = callback();
        if (
          maybePromise !== undefined &&
          maybePromise !== null &&
          typeof (maybePromise as unknown as Promise<unknown>).then ===
            "function"
        ) {
          throw new TypeError(
            "[Subatom] Route group callbacks must be synchronous. An async " +
              "callback can interleave with other route registrations and " +
              "corrupt the group context stack.",
          );
        }
      }
    } finally {
      this.app._popGroupContext();
    }

    return this;
  }

  private registerDirect(
    method: HttpMethod,
    path: string,
    args: any[],
  ): void {
    const context = this.buildContext();
    registerGroupRoute(this.app, context, method, path, args);
  }

  private buildContext(): IGroupContext {
    const parent = this.app._currentGroupContext();
    return buildGroupContext(
      parent,
      this.ownPrefix,
      this.ownMiddlewares,
      this.ownTags,
      this.ownRateLimitSpec,
      this.ownRateLimitMiddleware,
    );
  }
}