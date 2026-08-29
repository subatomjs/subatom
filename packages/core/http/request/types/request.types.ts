/**
 * @fileoverview Type interface for subatom native request object (Request).
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: explanation */
import type { IncomingMessage } from "node:http";
import type {
	FilesMap,
	IFileUpload,
} from "../../../../pipelines/files/types/files.types.js";

/**
 * Union type for req.files: an array of files or a field-name dictionary.
 */
export type RequestFiles = IFileUpload[] | FilesMap;

export interface RequestOptions {
	trustProxy?: boolean;
	defaultHost?: string;
}

export interface IParsedAccept {
	type: string;
	subtype: string;
	q: number;
}

/**
 * The public contract for an HTTP request as seen by route handlers and
 * middleware. Type against this — `(req: IRequest, res: Response) => {}` —
 * rather than the concrete `Request` class, which also exposes
 * construction/parsing internals you shouldn't need to touch.
 *
 * All type params default to sensible values, so bare `IRequest` (no
 * generics) is a complete, ready-to-use type on its own.
 */
export interface IRequest<
	Body = any,
	Query = Record<string, string>,
	Params = Record<string, string>,
	Cookies = Record<string, string>,
	User = any,
	Locals = Record<string, any>,
	Ip = string,
	Protocol = "http" | "https",
	Secure = boolean,
	Hostname = string,
	Path = string,
> {
	readonly raw: IncomingMessage;
	readonly method: string;
	readonly url: string;
	readonly path: Path;
	readonly headers: Record<string, string | string[] | undefined>;

	/** Resolved protocol for this request ("http" or "https"). */
	readonly protocol: Protocol;
	/** Resolved host (host + optional port) for this request. */
	readonly host: Hostname;
	/** Hostname without port number. */
	readonly hostname: string;
	/** Resolved client IP address. */
	readonly ip: Ip;
	/** Whether the connection is encrypted/secure (HTTPS). */
	readonly secure: Secure;

	body: Body;
	query: Query;
	params: Params;
	cookies: Cookies;

	user?: User;
	locals: Locals;

	file?: IFileUpload | undefined;
	files?: RequestFiles | undefined;

	/** Case-insensitive request header lookup. */
	get(name: string): string | undefined;
	/** Reads the raw stream and converts it to a UTF-8 string. */
	text(limitInBytes?: number): Promise<string>;
	/** Parses the body as JSON. */
	json<T = Body>(limitInBytes?: number): Promise<T>;
	/** Parses the body as URL-encoded form data. */
	formData(limitInBytes?: number): Promise<URLSearchParams>;
	/** Whether the client's Accept header includes the given content type. */
	accepts(contentType: string): boolean;
	/** Consumes the request stream into a Buffer with an explicit byte size limit. */
	buffer(limitInBytes?: number): Promise<Buffer>;

	// Lets middleware attach custom props (req.session, req.auth, etc.)
	// without widening the whole interface to `any`.
	[key: string]: any;
}
