import type { IncomingMessage } from "node:http";
import type {
	FilesMap,
	IUploadFile,
} from "../framework/pipeline/IUploadFile.js";

/**
 * Union type for req.files: an array of files or a field-name dictionary.
 */
export type RequestFiles = IUploadFile[] | FilesMap;

export interface RequestOptions {
	/**
	 * Whether to trust `X-Forwarded-Proto` / `X-Forwarded-Host` / `X-Forwarded-For`
	 * headers when resolving the request's protocol, host, and IP address (e.g. when
	 * running behind a load balancer, reverse proxy, or CDN that sets these headers).
	 *
	 * Defaults to false. Leave this off unless Subatom is actually
	 * deployed behind a proxy you control - trusting these headers from an
	 * untrusted client lets a caller spoof the resolved protocol/host/ip,
	 * which can be abused for cache poisoning, broken CORS checks, or
	 * incorrect absolute-URL generation.
	 *
	 * Can also be set globally via the SUBATOM_TRUST_PROXY=true env var so
	 * it doesn't need to be threaded through every call site.
	 */
	trustProxy?: boolean;
	/**
	 * Fallback host to use when no Host header is present at all (rare,
	 * but technically legal for HTTP/1.0 requests) and no proxy header is
	 * trusted/present. Defaults to SUBATOM_DEFAULT_HOST env var, then
	 * "localhost" as an absolute last resort.
	 */
	defaultHost?: string;
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
	Body = unknown,
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

	file?: IUploadFile | undefined;
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
