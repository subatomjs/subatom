// subatom/package/core/bootstrap/subatom/Subatom.ts
import { configEnv } from "../../../cli-engine/utils/env/env.js";
import type { EnvOptions } from "../../../types/engine-utils/EnvOptions.js";
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
  IHandler,
  IRouteMeta,
  IRouteOptions,
} from "../../../types/framework/router/IRouter.js";
import type {
  ErrorMiddlewareHandler,
  MiddlewareHandler,
} from "../../../types/http/IMiddleware.js";
import { Router } from "../../router/Router.js";
import type { SubatomServer } from "../subatom-server/SubatomServer.js";
import { dispatchGroup } from "./services/groupDispatcher.service.js";

import { registerMiddleware } from "./services/middlewareRegistrar.service.js";
import { registerProcessBoundary } from "./services/processBoundary.service.js";
import {
  registerGroupRoute,
  registerPossiblyGrouped,
} from "../../router/services/routeRegistrar.service.js";
import {
  mergeRouter,
  mergeSubRouter,
} from "../../router/services/routerMerger.service.js";
import {
  ensureServerInstance,
  performGracefulShutdown,
} from "./services/serverManager.service.js";
import type {
  HttpMethod,
  RouteGroupBuilder,
} from "./subordinate/RouteGroupBuilder.js";

import type {
  IWebSocketHandlers,
  IWebSocketRoute,
} from "../../../types/websocket/IWebSocket.js";
import { IRequestPipelineConfig } from "../../pipeline/modifier/RequestPipeline.js";
import {
  registerInterceptor,
  registerSerializer,
  registerTransformer,
} from "../../pipeline/modifier/services/pipelineRegistrar.service.js";

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

  constructor(envOptions?: EnvOptions) {
    configEnv(envOptions);
    registerProcessBoundary(
      () => this.serverInstance,
      (exitCode) => this.gracefulShutdown(exitCode),
    );
  }

  public ws(path: string, handlers: IWebSocketHandlers): this {
    if (this.serverInstance) {
      console.warn(
        `[Subatom WS] Route "${path}" registered after start(); it won't be active until restart.`,
      );
    }
    this.wsRoutes.push({ path, handlers });
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
    ...rest: Array<MiddlewareHandler | Router>
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
      if (handler instanceof Router) {
        mergeSubRouter(this.router, prefix, handler);
      } else if (typeof handler === "function") {
        // Registers as a prefix-scoped "USE" route so it runs before any
        // route matched under this prefix, mirroring the order handlers
        // were passed in — same semantics as Express's path-scoped .use().
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
  public group(prefix?: string): RouteGroupBuilder;
  public group(prefix?: string, router?: Router): this | RouteGroupBuilder {
    return dispatchGroup(this, this.router, prefix, router) as unknown as
      | this
      | RouteGroupBuilder;
  }

  public useError(handler: ErrorMiddlewareHandler): this {
    this.errorMiddlewares.push(handler);
    return this;
  }

  public get(path: string, ...args: Array<IHandler | IRouteOptions>): this {
    registerPossiblyGrouped(
      this.router,
      this._currentGroupContext(),
      "GET",
      path,
      args,
    );
    return this;
  }

  public post(path: string, ...args: Array<IHandler | IRouteOptions>): this {
    registerPossiblyGrouped(
      this.router,
      this._currentGroupContext(),
      "POST",
      path,
      args,
    );
    return this;
  }

  public put(path: string, ...args: Array<IHandler | IRouteOptions>): this {
    registerPossiblyGrouped(
      this.router,
      this._currentGroupContext(),
      "PUT",
      path,
      args,
    );
    return this;
  }

  public patch(path: string, ...args: Array<IHandler | IRouteOptions>): this {
    registerPossiblyGrouped(
      this.router,
      this._currentGroupContext(),
      "PATCH",
      path,
      args,
    );
    return this;
  }

  public delete(path: string, ...args: Array<IHandler | IRouteOptions>): this {
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
    meta: IRouteMeta,
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
