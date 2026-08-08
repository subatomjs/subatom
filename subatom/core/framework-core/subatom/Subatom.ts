import { configEnv } from "../../../engine/utils/env/env.js";
import type { EnvOptions } from "../../../types/engine-utils/EnvOptions.js";
import type {
  IGroupContext,
  ISubatomServerConfig,
} from "../../../types/framework/core/IFrameworkCore.js";
import type {
  IHandler,
  IRouteMeta,
} from "../../../types/framework/router/IRouter.js";
import type {
  ErrorMiddlewareHandler,
  MiddlewareHandler,
} from "../../../types/http/IMiddleware.js";
import { Router } from "../../router/Router.js";
import type { SubatomServer } from "../subatom-server/SubatomServer.js";
import { dispatchGroup } from "./services/groupDispatcher.service.js";

// Import isolated modular service functions
import { registerMiddleware } from "./services/middlewareRegistrar.service.js";
import { registerProcessBoundary } from "./services/processBoundary.service.js";
import {
  registerGroupRoute,
  registerPossiblyGrouped,
} from "./services/routeRegistrar.service.js";
import {
  mergeRouter,
  mergeSubRouter,
} from "./services/routerMerger.service.js";
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
} from "../../../types/framework/websocket/IWebSocket.js";

export class Subatom {
  private readonly router = new Router();
  private readonly middlewares: MiddlewareHandler[] = [];
  private readonly errorMiddlewares: ErrorMiddlewareHandler[] = [];
  private readonly wsRoutes: IWebSocketRoute[] = [];
  private serverInstance?: SubatomServer;
  private customConfig: ISubatomServerConfig = {};

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

  public use(fnOrPrefix: any, maybeRouter?: any): this {
    if (typeof fnOrPrefix === "function") {
      registerMiddleware(this.middlewares, this.errorMiddlewares, fnOrPrefix);
    } else if (typeof fnOrPrefix === "string" && maybeRouter) {
      mergeSubRouter(this.router, fnOrPrefix, maybeRouter);
    } else if (fnOrPrefix instanceof Router) {
      mergeRouter(this.router, fnOrPrefix);
    }
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

  public get(path: string, ...handlers: IHandler[]): this {
    registerPossiblyGrouped(
      this.router,
      this._currentGroupContext(),
      "GET",
      path,
      handlers,
    );
    return this;
  }

  public post(path: string, ...handlers: IHandler[]): this {
    registerPossiblyGrouped(
      this.router,
      this._currentGroupContext(),
      "POST",
      path,
      handlers,
    );
    return this;
  }

  public put(path: string, ...handlers: IHandler[]): this {
    registerPossiblyGrouped(
      this.router,
      this._currentGroupContext(),
      "PUT",
      path,
      handlers,
    );
    return this;
  }

  public patch(path: string, ...handlers: IHandler[]): this {
    registerPossiblyGrouped(
      this.router,
      this._currentGroupContext(),
      "PATCH",
      path,
      handlers,
    );
    return this;
  }

  public delete(path: string, ...handlers: IHandler[]): this {
    registerPossiblyGrouped(
      this.router,
      this._currentGroupContext(),
      "DELETE",
      path,
      handlers,
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
}
