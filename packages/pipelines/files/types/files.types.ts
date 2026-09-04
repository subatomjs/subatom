/**
 * @fileoverview Type declaration file of FileUpload.ts & helpers & operations files.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IncomingHttpHeaders, ServerResponse } from "node:http";
import type { Readable } from "node:stream";
import type { NextFunction } from "../../next/types/nextFunction.types.js";
import type { FileUpload } from "../FileUpload.js";
import type { IResponse } from "../../../core/http/response/types/response.types.js";
import type { IRequest } from "../../../core/http/request/types/request.types.js";

export interface FileUploadOptions {
	filename: string;
	encoding: string;
	mimetype: string;
	storageType: "memory" | "disk";
	buffer?: Buffer;
	path?: string;
	size?: number;
}

export interface IFileUpload {
	readonly filename: string;
	readonly encoding: string;
	readonly mimetype: string;
	readonly storageType: "memory" | "disk";
	readonly path: string | undefined;
	readonly size: number | undefined;

	/** True once `destroy()` has been called; the file is no longer readable. */
	readonly destroyed: boolean;

	/** The in-memory buffer, if `storageType` is "memory". Undefined for disk-backed files. */
	readonly bufferContent: Buffer | undefined;

	/** Returns the file content as a Buffer, reading from disk if necessary. */
	buffer(): Promise<Buffer>;

	/** Returns a readable stream of the file content. */
	stream(): Readable;

	/** Frees the in-memory buffer and/or deletes the temp file on disk. */
	destroy(): Promise<void>;
}

export type StorageStrategy = "memory" | "disk";

export interface FileParserConfig {
	storage: StorageStrategy;
	dest?: string;
	allowedMimeTypes?: string[];
	limits?: {
		fileSize?: number;
		files?: number;
		fields?: number;
		fieldSize?: number;
		parts?: number;
	};
}

export interface FileUploadPipelineOptions extends FileParserConfig {
	fieldname?: string;
}

/**
 * Dictionary map of uploaded files supporting scalar files and file lists.
 */
export interface FilesMap {
	[key: string]: IFileUpload | IFileUpload[] | undefined;
}

/**
 * Union type for request files: supporting numeric indexation as an array
 * or string indexation as a FilesMap.
 */
export type RequestFiles =
	| IFileUpload[]
	| FilesMap
	| (IFileUpload[] & FilesMap);

export interface IFrameworkRequest {
	body?: unknown;
	file?: IFileUpload | undefined;
	files?: RequestFiles;
	headers: IncomingHttpHeaders;
	url?: string;
	method?: string;
	raw?: Readable;
	getStream?: () => Readable;
	getHeaders?: () => IncomingHttpHeaders;
}

export type Middleware<
	TReq extends RequestTarget = IFrameworkRequest,
	TRes extends ResponseTarget = ServerResponse,
> = (
	req: TReq,
	res: TRes,
	next: NextFunction,
) => Promise<void> | void | unknown;

export interface ParseResult {
	body: Record<string, unknown>;
	files: Record<string, FileUpload[]>;
}

export interface Destroyable {
	destroy: (err?: Error) => void;
}

export interface FileConfigMeta {
	type: "single" | "array" | "fields" | "any" | "none";
	fieldname?: string | undefined;
	maxCount?: number | undefined;
	fields?: Array<{ name: string; maxCount?: number }> | undefined;
	options?: FileUploadPipelineOptions | undefined;
}

export interface DocumentedMiddleware
	extends Middleware<IFrameworkRequest, ServerResponse> {
	_fileConfig?: FileConfigMeta;
}

export type ResponseTarget =
	| IResponse
	| ServerResponse
	| {
			raw?: ServerResponse;
			rawResponse?: ServerResponse;
			headersSent?: boolean;
			status?: (code: number) => { json: (body: unknown) => void };
			writeHead?: (
				statusCode: number,
				headers?: Record<string, string>,
			) => unknown;
			end?: (chunk?: unknown) => unknown;
	  };

export type RequestTarget =
	| IRequest
	| IFrameworkRequest
	| {
			raw?: Readable;
			headers?: IncomingHttpHeaders;
			getStream?: () => Readable;
			getHeaders?: () => IncomingHttpHeaders;
	  };

export type ErrorHandlerResponse =
	| IResponse
	| ServerResponse
	| {
			raw?: ServerResponse;
			rawResponse?: ServerResponse;
			headersSent?: boolean;
			status: (code: number) => { json: (data: unknown) => void };
			json?: (data: unknown) => void;
			writeHead?: (
				statusCode: number,
				headers?: Record<string, string>,
			) => unknown;
			end?: (chunk?: unknown) => unknown;
	  };
