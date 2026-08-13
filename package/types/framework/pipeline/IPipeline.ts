import { IRequest } from "../../http/IRequest.js";
import { IResponse } from "../../http/IResponse.js";

export type TCorsOriginFunction = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) => void;

export interface ICorsOptions {
  origin?: string | string[] | boolean | TCorsOriginFunction;
  methods?: string | string[];
  allowedHeaders?: string | string[];
  exposedHeaders?: string | string[];
  credentials?: boolean;
  maxAge?: number;
  optionsSuccessStatus?: number;
}

export interface ILimit {
  limit?: string | number;
}

export interface IRawOptions {
  limit?: string | number;
  type?: string | string[];
}

export interface IStaticOptions {
  index?: string;
  dotfiles?: "allow" | "ignore" | "deny";
  autoCreateDir?: boolean;
}

export interface ITextOptions {
  limit?: string | number;
  type?: string | string[];
  defaultEncoding?: BufferEncoding;
}

export interface IPipelineContext<TState = Record<string, unknown>> {
  readonly req: IRequest;
  readonly res: IResponse;
  readonly routePath?: string;
  readonly method?: string;
  readonly meta?: Record<string, unknown>;
  state: TState;
}

export type BeforeRequestFn = (
  req: IPipelineContext["req"],
  ctx: IPipelineContext,
) => unknown | Promise<unknown>;

export type AfterRequestFn = (
  data: unknown,
  ctx: IPipelineContext,
) => unknown | Promise<unknown>;

export type BeforeResponseFn = (
  response: unknown,
  ctx: IPipelineContext,
) => unknown | Promise<unknown>;

export type AfterResponseFn = (
  response: unknown,
  ctx: IPipelineContext,
) => unknown | Promise<unknown>;

export interface ITransformer {
  name?: string;
  priority?: number;
  beforeRequest?: BeforeRequestFn;
  afterRequest?: AfterRequestFn;
  beforeResponse?: BeforeResponseFn;
  afterResponse?: AfterResponseFn;
}

export type InterceptorNext = () => Promise<unknown>;

export type InterceptorFn = (
  ctx: IPipelineContext,
  next: InterceptorNext,
) => unknown | Promise<unknown>;

export interface IInterceptor {
  name?: string;
  priority?: number;
  intercept: InterceptorFn;
}

export type SerializeFn = (
  data: unknown,
  ctx: IPipelineContext,
) => unknown | Promise<unknown>;

export interface ISerializer {
  name?: string;
  priority?: number;
  contentType?: string;
  serialize: SerializeFn;
}

export type PipelineScope = "global" | "group" | "route";

export function sortedByPriority<T extends { priority?: number }>(
  bucket: T[],
): T[] {
  return bucket
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const diff = (a.item.priority ?? 0) - (b.item.priority ?? 0);
      return diff !== 0 ? diff : a.i - b.i;
    })
    .map((x) => x.item);
}