import type { IRequestPipelineConfig } from "../../../core/pipeline/modifier/RequestPipeline.js";
import { MiddlewareHandler } from "../../http/IMiddleware.js";
import type { IRequest } from "../../http/IRequest.js";
import type { IResponse } from "../../http/IResponse.js";
import type { NextFunction } from "../pipeline/INext.js";
import type {
  IInterceptor,
  ISerializer,
  ITransformer,
} from "../pipeline/IPipeline.js";
import type {
  IResourceController,
  IResourceOptions,
} from "./IResourceRouter.js";

export interface IRouteSchema {
  body?: any;
  query?: any;
  params?: any;
  headers?: any;
  file?: any;
  files?: any;
}

export type IHandler = (
  req: IRequest,
  res: IResponse,
  next: NextFunction,
) => void | Promise<void>;

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
  routerPipeline?: IRoutePipelineRef;
  schema?: IRouteSchema;
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

export type RouteArgument = IHandler | MiddlewareHandler | IRouteMetaOptions;

export interface IRouter {
  get(path: string, ...args: RouteArgument[]): void;
  post(path: string, ...args: RouteArgument[]): void;
  put(path: string, ...args: RouteArgument[]): void;
  patch(path: string, ...args: RouteArgument[]): void;
  delete(path: string, ...args: RouteArgument[]): void;
  options(path: string, ...args: RouteArgument[]): void;
  head(path: string, ...args: RouteArgument[]): void;
  trace(path: string, ...args: RouteArgument[]): void;
  connect(path: string, ...args: RouteArgument[]): void;
  query(path: string, ...args: RouteArgument[]): void;
  all(path: string, ...args: RouteArgument[]): void;

  transformer(transformer: ITransformer): void;
  intercept(interceptor: IInterceptor): void;
  serializer(serializer: ISerializer): void;
  getPipelineConfig(): IRequestPipelineConfig;

  resource(
    basePath: string,
    controller: IResourceController,
    options?: IResourceOptions,
  ): void;
  use(
    pathOrHandler: string | IHandler | IRouter,
    ...handlers: Array<IHandler | IRouter>
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
