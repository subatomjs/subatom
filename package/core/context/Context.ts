// subatom/package/core/context/Context.ts

import type { ISession } from "../../types/framework/factory-function/ISession.js";
import type {
  IContext,
  InferBody,
  InferFile,
  InferFiles,
  InferHeaders,
  InferParams,
  InferQuery,
} from "../../types/context/IContext.js";
import type {
  CookieOptions,
  DownloadOptions,
  FormatHandlers,
  IResponse,
  IResponseHelper,
  SendFileOptions,
} from "../../types/http/IResponse.js";
import type { IRequest } from "../../types/http/IRequest.js";

const CONTEXT_SYMBOL = Symbol.for("subatom.context");

export class Context<
  TSchema = any,
  TLocals extends Record<string, any> = Record<string, any>,
  TUser = any,
> implements IContext<TSchema, TLocals, TUser> {
  public readonly req: IRequest;
  public readonly res: IResponse;

  constructor(req: IRequest, res: IResponse) {
    this.req = req;
    this.res = res;
  }

  // Aliases
  public get request(): IRequest {
    return this.req;
  }

  public get response(): IResponse {
    return this.res;
  }

  // Request Data Facades (zero-duplication getters)
  public get params(): InferParams<TSchema> {
    return (this.req.params || {}) as InferParams<TSchema>;
  }

  public get query(): InferQuery<TSchema> {
    return (this.req.query || {}) as InferQuery<TSchema>;
  }

  public get body(): InferBody<TSchema> {
    return this.req.body as InferBody<TSchema>;
  }

  public get headers(): InferHeaders<TSchema> {
    return this.req.headers as InferHeaders<TSchema>;
  }

  public get cookies(): Record<string, string> {
    return this.req.cookies || {};
  }

  public get files(): InferFiles<TSchema> {
    return this.req.files as InferFiles<TSchema>;
  }

  public get file(): InferFile<TSchema> {
    return this.req.file as InferFile<TSchema>;
  }

  public get user(): TUser {
    return this.req.user as TUser;
  }

  public set user(value: TUser) {
    this.req.user = value;
  }

  public get locals(): TLocals {
    return this.req.locals as TLocals;
  }

  public set locals(value: TLocals) {
    this.req.locals = value;
  }

  // Request Properties
  public get ip(): string {
    return this.req.ip;
  }

  public get method(): string {
    return this.req.method;
  }

  public get path(): string {
    return this.req.path;
  }

  public get url(): string {
    return this.req.url;
  }

  public get protocol(): "http" | "https" {
    return this.req.protocol;
  }

  public get secure(): boolean {
    return this.req.secure;
  }

  public get host(): string {
    return this.req.host;
  }

  public get hostname(): string {
    return this.req.hostname;
  }

  public get session(): ISession {
    return this.req.session;
  }

  public get sessionID(): string {
    return this.req.sessionID;
  }

  // Response Properties
  public get headersSent(): boolean {
    return this.res.headersSent;
  }

  public get writableEnded(): boolean {
    return this.res.writableEnded;
  }

  public get statusCode(): number {
    return this.res.statusCode;
  }

  public get helper(): IResponseHelper {
    return this.res.helper;
  }

  // Request Methods
  public get(headerName: string): string | undefined {
    return this.req.get(headerName);
  }

  public accepts(contentType: string): boolean {
    return this.req.accepts(contentType);
  }

  // Response Methods
  public status(code: number): this {
    this.res.status(code);
    return this;
  }

  public json(data: unknown): this {
    this.res.json(data);
    return this;
  }

  public send(body?: string | Buffer | Uint8Array | object): void {
    this.res.send(body);
  }

  public html(htmlContent: string): this {
    this.res.html(htmlContent);
    return this;
  }

  public set(name: string, value: string | string[]): this;
  public set(headers: Record<string, string | string[]>): this;
  public set(
    nameOrHeaders: string | Record<string, string | string[]>,
    value?: string | string[],
  ): this {
    if (typeof nameOrHeaders === "string") {
      this.res.set(nameOrHeaders, value!);
    } else {
      this.res.set(nameOrHeaders);
    }
    return this;
  }

  public header(name: string, value: string | string[]): this {
    this.res.header(name, value);
    return this;
  }

  public setHeader(name: string, value: string | string[]): this {
    this.res.setHeader(name, value);
    return this;
  }

  public type(contentType: string): this {
    this.res.type(contentType);
    return this;
  }

  public contentType(contentType: string): this {
    this.res.contentType(contentType);
    return this;
  }

  public cookie(name: string, value: string, options?: CookieOptions): this {
    this.res.cookie(name, value, options);
    return this;
  }

  public clearCookie(name: string, options?: CookieOptions): this {
    this.res.clearCookie(name, options);
    return this;
  }

  public redirect(url: string, statusCode?: number): void {
    this.res.redirect(url, statusCode);
  }

  public attachment(filename?: string): this {
    this.res.attachment(filename);
    return this;
  }

  public sendFile(filePath: string, options?: SendFileOptions): void {
    this.res.sendFile(filePath, options);
  }

  public download(
    filePath: string,
    filename?: string,
    options?: DownloadOptions,
  ): void {
    this.res.download(filePath, filename, options);
  }

  public stream(readableStream: NodeJS.ReadableStream): void {
    this.res.stream(readableStream);
  }

  public end(chunk?: any): void {
    this.res.end(chunk);
  }

  public format(
    handlers: FormatHandlers,
    requestHeaders?: Record<string, string | string[] | undefined>,
  ): this {
    this.res.format(handlers, requestHeaders || this.req.headers);
    return this;
  }
}

/**
 * Retrieves an existing Context for the request or instantiates a new one.
 */
export function getOrCreateContext<
  TSchema = any,
  TLocals extends Record<string, any> = Record<string, any>,
  TUser = any,
>(req: IRequest, res: IResponse): IContext<TSchema, TLocals, TUser> {
  const existing = (req as any)[CONTEXT_SYMBOL];
  if (existing) {
    return existing as IContext<TSchema, TLocals, TUser>;
  }

  const ctx = new Context<TSchema, TLocals, TUser>(req, res);
  Object.defineProperty(req, CONTEXT_SYMBOL, {
    value: ctx,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  return ctx;
}