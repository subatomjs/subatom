import type { ServerResponse } from "node:http";
import type {
	TErrorHelperName,
	TSuccessHelperName,
} from "../services/helpers.service.js";

export interface CookieOptions {
	/** Max age in milliseconds (converted to seconds per spec). */
	maxAge?: number;
	expires?: Date;
	httpOnly?: boolean;
	secure?: boolean;
	path?: string;
	domain?: string;
	sameSite?: "Strict" | "Lax" | "None" | boolean;
}

export interface SendFileOptions {
	/**
	 * Directory the requested path must resolve inside of. Strongly
	 * recommended whenever the path (or any part of it) can be influenced
	 * by user input, to prevent path-traversal attacks.
	 */
	root?: string;
	/** Override the auto-detected Content-Type. */
	contentType?: string;
}

export interface DownloadOptions extends SendFileOptions {
	filename?: string;
}

export type FormatHandlers = {
	[key: string]: () => void;
};

/**
 * The public contract for an HTTP response as seen by route handlers and
 * middleware. Type against this — `(req: IRequest, res: IResponse) => {}` —
 * rather than the concrete `Response` class, which also exposes internal
 * header-injection/path-resolution helpers you shouldn't need to touch.
 */
export interface IResponse {
	readonly raw: ServerResponse;
	//Helper
	readonly helper: IResponseHelper;
	// ============================================================
	// State inspection
	// ============================================================
	readonly headersSent: boolean;
	readonly writableEnded: boolean;
	/** Alias of `writableEnded`, mirrors the naming used elsewhere in the framework. */
	readonly finished: boolean;
	readonly statusCode: number;
	readonly rawResponse: ServerResponse;

	// ============================================================
	// Status & headers
	// ============================================================

	/** Set the HTTP status code. No-ops (with a warning) once headers are sent. */
	status(code: number): this;

	set(name: string, value: string | string[]): this;
	set(headers: Record<string, string | string[]>): this;

	/** Append a value to an existing header instead of overwriting it. */
	append(name: string, value: string | string[]): this;

	get(name: string): string | string[] | undefined;

	/** Convenience alias for `set`. */
	setHeader(headerName: string, value: string | number | string[]): this;
	/** Convenience alias for `set`. */
	header(name: string, value: string | string[]): this;

	type(contentType: string): this;
	/** Alias of `type`. */
	contentType(contentType: string): this;

	removeHeader(name: string): this;

	/** Adds "Vary" semantics without clobbering any existing value. */
	vary(field: string): this;

	location(url: string): this;

	// ============================================================
	// Cookies
	// ============================================================

	cookie(name: string, value: string, options?: CookieOptions): this;
	clearCookie(name: string, options?: CookieOptions): this;

	// ============================================================
	// Redirect
	// ============================================================

	redirect(url: string, statusCode?: number): void;

	// ============================================================
	// Body transmission
	// ============================================================

	send(body?: string | Buffer | Uint8Array | object): void;
	json(data: unknown): this;
	html(htmlContent: string): this;
	/** End the response stream manually, bypassing the higher-level helpers. */
	end(chunk?: unknown): void;

	// ============================================================
	// Streaming / files
	// ============================================================

	/**
	 * Pipe an arbitrary readable stream to the client. Stream errors are
	 * caught and converted into a 500 response (if headers haven't been
	 * sent yet) instead of crashing the process.
	 */
	stream(readableStream: NodeJS.ReadableStream): void;

	/**
	 * Send a file inline (browser decides how to render it, e.g. images/PDFs).
	 * Content-Type is inferred from the extension unless overridden.
	 */
	sendFile(filePath: string, options?: SendFileOptions): void;

	/**
	 * Send a file as a forced download (`Content-Disposition: attachment`).
	 */
	download(
		filePath: string,
		filename?: string,
		options?: DownloadOptions,
	): void;

	/**
	 * Set Content-Disposition. Encodes non-ASCII filenames per RFC 5987 and
	 * escapes quotes to prevent header/attribute injection.
	 */
	attachment(filename?: string): this;
	format(
		handlers: FormatHandlers,
		requestHeaders: Record<string, string | string[] | undefined>,
	): this;
}

export type IResponseHelper = {
	[K in TSuccessHelperName]: (data?: unknown) => IResponse;
} & {
	[K in TErrorHelperName]: (
		messageOrError?: string | Error,
		details?: unknown,
	) => IResponse;
};
