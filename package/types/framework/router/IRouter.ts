// subatom/package/types/framework/router/IRouter.ts

import type { IRequestPipelineConfig } from "../../../core/pipeline/modifier/RequestPipeline.js";
import type {
  IContext,
  IController,
  IContextMiddleware,
  ILegacyHandler,
  IRouteMiddleware,
} from "../../context/IContext.js";
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

export type {
  IContext,
  IController,
  IContextMiddleware,
  ILegacyHandler,
  IRouteMiddleware,
};

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
  controller?: IController<any, Record<string, any>, any, any>;
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
  TLocals extends Record<string, any> = Record<string, any>,
  TUser = any,
  TReturn = unknown,
> {
  name?: string;
  tags?: string[];
  rateLimit?: string;
  schema?: TSchema;
  middleware?: Array<IRouteMiddleware>;
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
  | IRouteOptions<TSchema, any, any, any>
  | IHandler
  | IRouteMiddleware
  | IRouteMetaOptions;

export interface IRouter {
  get<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  get(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

  post<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  post(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

  put<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  put(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

  patch<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  patch(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

  delete<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  delete(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

  options<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  options(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

  head<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  head(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

  trace<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  trace(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

  connect<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  connect(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

  query<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
  ): this;
  query(path: string, ...args: Array<IHandler | IRouteMetaOptions>): this;

  all<TSchema extends IRouteSchema = IRouteSchema, TReturn = unknown>(
    path: string,
    options: IRouteOptions<TSchema, any, any, TReturn>,
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