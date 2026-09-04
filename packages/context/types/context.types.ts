/**
 * @fileoverview Type interface file of context object.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ServerResponse } from "node:http";
import type { ISession } from "../../pipelines/middlewares/types/session.types.js";
import type {
	DocumentedMiddleware,
	FilesMap,
	IFrameworkRequest,
	IFileUpload,
	Middleware,
	// RequestFiles,
} from "../../pipelines/files/types/files.types.js";
import type {
	CookieOptions,
	DownloadOptions,
	FormatHandlers,
	IResponse,
	IResponseHelper,
	SendFileOptions,
} from "../../core/http/response/types/response.types.js";
import type { IRequest } from "../../core/http/request/types/request.types.js";
import type { NextFunction } from "../../pipelines/next/types/nextFunction.types.js";

/**
 * Standard Schema & Validator Inference Engine.
 * Supports subatom-infer, Standard Schema (V1), Zod, Valibot, and custom object schemas.
 */
export type InferType<T> = T extends {
	"~standard": { types?: { output: infer U } };
}
	? U
	: T extends { _output: infer U }
		? U
		: T extends { _type: infer U }
			? U
			: T extends { infer: infer U }
				? U
				: T extends { parse: (...args: never[]) => infer U }
					? U
					: T extends {
								safeParse: (
									...args: never[]
								) =>
									| { success: true; data: infer U }
									| { success: false; [key: string]: unknown };
							}
						? U
						: T extends readonly (infer U)[]
							? Array<InferType<U>>
							: T extends (...args: never[]) => infer R
								? R
								: T extends Record<string, unknown>
									? { [K in keyof T]: InferType<T[K]> }
									: T;

type OptionalKeys<T> = {
	[K in keyof T]: undefined extends InferType<T[K]> ? K : never;
}[keyof T];

type RequiredKeys<T> = {
	[K in keyof T]: undefined extends InferType<T[K]> ? never : K;
}[keyof T];

export type InferMappedObject<T> = {
	[K in RequiredKeys<T>]: InferType<T[K]>;
} & {
	[K in OptionalKeys<T>]?: InferType<T[K]>;
};

export type InferObjectSchema<
	T,
	TFallback = Record<string, unknown>,
> = T extends undefined
	? TFallback
	: T extends { "~standard": { types?: { output: infer U } } }
		? U
		: T extends { _output: infer U }
			? U
			: T extends { _type: infer U }
				? U
				: T extends { infer: infer U }
					? U
					: T extends readonly (infer U)[]
						? Array<InferType<U>>
						: T extends Record<string, unknown>
							? InferMappedObject<T>
							: TFallback;

export type InferParams<TSchema> = TSchema extends { params: infer P }
	? InferObjectSchema<P, Record<string, string | undefined>>
	: Record<string, string | undefined>;

export type InferQuery<TSchema> = TSchema extends { query: infer Q }
	? InferObjectSchema<Q, Record<string, string | undefined>>
	: Record<string, string | undefined>;

export type InferBody<TSchema> = TSchema extends { body: infer B }
	? InferObjectSchema<B, unknown>
	: unknown;

export type InferHeaders<TSchema> = TSchema extends { headers: infer H }
	? InferObjectSchema<H, Record<string, string | string[] | undefined>>
	: Record<string, string | string[] | undefined>;

export type InferFile<TSchema> = TSchema extends { file: infer F }
	? InferType<F>
	: TSchema extends { files: Record<string, infer Fs> }
		? InferType<Fs> extends IFileUpload
			? InferType<Fs>
			: IFileUpload | undefined
		: IFileUpload | undefined;

/**
 * Resolves schema-derived files with exact property names (e.g. avatar, documents)
 * and falls back to string-indexable FilesMap.
 */
export type InferFiles<TSchema> = TSchema extends { files: infer Fs }
	? Fs extends Record<string, unknown>
		? {
				[K in keyof Fs]: InferType<Fs[K]> extends infer Resolved
					? Resolved extends unknown[]
						? IFileUpload[]
						: IFileUpload
					: IFileUpload;
			} & FilesMap
		: FilesMap
	: FilesMap;

/**
 * Developer-facing Context facade wrapping underlying IRequest and IResponse.
 */
export interface IContext<
	TSchema = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>,
	TUser = unknown,
> {
	// Underlying HTTP abstractions
	readonly req: IRequest<
		InferBody<TSchema>,
		InferQuery<TSchema>,
		InferParams<TSchema>,
		Record<string, string>,
		TUser,
		TLocals
	>;
	readonly res: IResponse;
	readonly request: IRequest<
		InferBody<TSchema>,
		InferQuery<TSchema>,
		InferParams<TSchema>,
		Record<string, string>,
		TUser,
		TLocals
	>;
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

	/**
	 * Checks if the request's Accept header matches the given type(s).
	 * - Single string parameter returns boolean (true/false).
	 * - Multiple string parameters or an array return the best matching string, or false.
	 */
	accepts(type: string): boolean;
	accepts(...types: string[]): string | false;
	accepts(types: string[]): string | false;

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
	download(
		filePath: string,
		filename?: string,
		options?: DownloadOptions,
	): void;
	stream(readableStream: NodeJS.ReadableStream): Promise<void>;
	end(chunk?: unknown): void;
	format(
		handlers: FormatHandlers,
		requestHeaders?: Record<string, string | string[] | undefined>,
	): this;
}

/**
 * Controller handler taking a typed Context.
 */
export type IController<
	TSchema = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>,
	TUser = unknown,
	TReturn = unknown,
> = (ctx: IContext<TSchema, TLocals, TUser>) => TReturn | Promise<TReturn>;

/**
 * Middleware taking a Context and next function.
 */
export type IContextMiddleware<
	TSchema = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>,
	TUser = unknown,
> = (
	ctx: IContext<TSchema, TLocals, TUser>,
	next: NextFunction,
) => unknown | Promise<unknown>;

/**
 * Legacy/Upload request-response handler signature.
 */
export type ILegacyHandler<
	TReq = IRequest | IFrameworkRequest,
	TRes = IResponse | ServerResponse,
> = (req: TReq, res: TRes, next: NextFunction) => unknown | Promise<unknown>;

/**
 * Union of Context-based and Request-based Middleware handlers.
 */
export type IRouteMiddleware<
	TSchema = unknown,
	TLocals extends Record<string, unknown> = Record<string, unknown>,
	TUser = unknown,
> =
	| IContextMiddleware<TSchema, TLocals, TUser>
	| ILegacyHandler<IRequest, IResponse>
	| ILegacyHandler<IFrameworkRequest, ServerResponse>
	| DocumentedMiddleware
	| Middleware;
