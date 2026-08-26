// subatom/package/types/context/IContext.ts

import type { ISession } from "../framework/factory-function/ISession.js";
import type {
  FilesMap,
  IUploadFile,
  RequestFiles,
} from "../framework/pipeline/IUploadFile.js";
import type {
  CookieOptions,
  DownloadOptions,
  FormatHandlers,
  IResponse,
  IResponseHelper,
  SendFileOptions,
} from "../http/IResponse.js";
import type { IRequest } from "../http/IRequest.js";
import type { NextFunction } from "../framework/pipeline/INext.js";

/**
 * Type extractor for arbitrary schema validators (subatom-infer, Zod, standard schemas).
 */
export type InferType<T> = T extends { _type: infer U }
  ? U
  : T extends { _output: infer U }
    ? U
    : T extends { infer: infer U }
      ? U
      : T extends { parse: (...args: any[]) => infer U }
        ? U
        : T extends {
              safeParse: (
                ...args: any[]
              ) => { success: true; data: infer U } | any;
            }
          ? U
          : T extends Array<infer U>
            ? Array<InferType<U>>
            : T extends (...args: any[]) => any
              ? ReturnType<T>
              : T extends object
                ? { [K in keyof T]: InferType<T[K]> }
                : T;

export type InferObjectSchema<T> = T extends undefined
  ? Record<string, any>
  : T extends { _type: infer U }
    ? U
    : T extends { _output: infer U }
      ? U
      : T extends { infer: infer U }
        ? U
        : T extends { parse: (...args: any[]) => infer U }
          ? U
          : T extends {
                safeParse: (
                  ...args: any[]
                ) => { success: true; data: infer U } | any;
              }
            ? U
            : T extends Record<string, any>
              ? { [K in keyof T]: InferType<T[K]> }
              : Record<string, any>;

export type InferParams<TSchema> = TSchema extends { params: infer P }
  ? InferObjectSchema<P>
  : Record<string, string>;

export type InferQuery<TSchema> = TSchema extends { query: infer Q }
  ? InferObjectSchema<Q>
  : Record<string, string>;

export type InferBody<TSchema> = TSchema extends { body: infer B }
  ? InferObjectSchema<B>
  : any;

export type InferHeaders<TSchema> = TSchema extends { headers: infer H }
  ? InferObjectSchema<H>
  : Record<string, string | string[] | undefined>;

export type InferFile<TSchema> = TSchema extends { file: infer F }
  ? InferType<F>
  : IUploadFile | undefined;

export type InferFiles<TSchema> = TSchema extends { files: infer Fs }
  ? InferObjectSchema<Fs>
  : RequestFiles | undefined;

/**
 * Developer-facing Context facade wrapping existing IRequest and IResponse.
 */
export interface IContext<
  TSchema = any,
  TLocals extends Record<string, any> = Record<string, any>,
  TUser = any,
> {
  // Underlying HTTP abstractions
  readonly req: IRequest;
  readonly res: IResponse;
  readonly request: IRequest;
  readonly response: IResponse;

  // Inferred Request Data Facade
  readonly params: InferParams<TSchema>;
  readonly query: InferQuery<TSchema>;
  readonly body: InferBody<TSchema>;
  readonly headers: InferHeaders<TSchema>;
  readonly cookies: Record<string, string>;
  readonly files: InferFiles<TSchema>;
  readonly file: InferFile<TSchema>;
  user: TUser;
  locals: TLocals;

  // Request Metadata
  readonly ip: string;
  readonly method: string;
  readonly path: string;
  readonly url: string;
  readonly protocol: "http" | "https";
  readonly secure: boolean;
  readonly host: string;
  readonly hostname: string;
  readonly session: ISession;
  readonly sessionID: string;

  // Response Status Inspection
  readonly headersSent: boolean;
  readonly writableEnded: boolean;
  readonly statusCode: number;
  readonly helper: IResponseHelper;

  // Request Methods
  get(headerName: string): string | undefined;
  accepts(contentType: string): boolean;

  // Response Facade Methods
  status(code: number): this;
  json(data: unknown): this;
  send(body?: string | Buffer | Uint8Array | object): void;
  html(htmlContent: string): this;
  set(name: string, value: string | string[]): this;
  set(headers: Record<string, string | string[]>): this;
  header(name: string, value: string | string[]): this;
  setHeader(name: string, value: string | string[]): this;
  type(contentType: string): this;
  contentType(contentType: string): this;
  cookie(name: string, value: string, options?: CookieOptions): this;
  clearCookie(name: string, options?: CookieOptions): this;
  redirect(url: string, statusCode?: number): void;
  attachment(filename?: string): this;
  sendFile(filePath: string, options?: SendFileOptions): void;
  download(filePath: string, filename?: string, options?: DownloadOptions): void;
  stream(readableStream: NodeJS.ReadableStream): void;
  end(chunk?: any): void;
  format(
    handlers: FormatHandlers,
    requestHeaders?: Record<string, string | string[] | undefined>,
  ): this;
}

/**
 * Controller handler taking a typed Context.
 */
export type IController<
  TSchema = any,
  TLocals extends Record<string, any> = Record<string, any>,
  TUser = any,
  TReturn = unknown,
> = (
  ctx: IContext<TSchema, TLocals, TUser>,
) => TReturn | Promise<TReturn>;

/**
 * Middleware taking a Context and next function.
 */
export type IContextMiddleware<
  TSchema = any,
  TLocals extends Record<string, any> = Record<string, any>,
  TUser = any,
> = (
  ctx: IContext<TSchema, TLocals, TUser>,
  next: NextFunction,
) => unknown | Promise<unknown>;

/**
 * Legacy/Upload request-response handler signature.
 */
export type ILegacyHandler = (
  req: any,
  res: any,
  next: NextFunction,
) => unknown | Promise<unknown>;

/**
 * Union of Context-based and Request-based Middleware handlers.
 */
export type IRouteMiddleware<
  TSchema = any,
  TLocals extends Record<string, any> = Record<string, any>,
  TUser = any,
> =
  | IContextMiddleware<TSchema, TLocals, TUser>
  | ILegacyHandler;