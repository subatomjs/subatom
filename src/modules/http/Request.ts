import type { IncomingMessage } from "node:http";
import type { TLSSocket } from "node:tls";
import { BadRequestError, PayloadTooLargeError } from "../../errors/Error.js";
import type { UploadFile } from "../file_upload/UploadFile.js";

/**
 * Dictionary mapping field names to either a single UploadFile or an array of UploadFiles.
 */
export type FilesMap = Record<string, UploadFile | UploadFile[]>;

/**
 * Union type for req.files: an array of files or a field-name dictionary.
 */
export type RequestFiles = UploadFile[] | FilesMap;

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

export class Request<
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
	public readonly raw: IncomingMessage;
	public readonly method: string;
	public readonly url: string;
	public readonly path: Path;
	public readonly headers: Record<string, string | string[] | undefined>;

	/** Resolved protocol for this request ("http" or "https"). */
	public readonly protocol: Protocol;
	/** Resolved host (host + optional port) for this request. */
	public readonly host: Hostname;
	/** Hostname without port number. */
	public readonly hostname: string;
	/** Resolved client IP address. */
	public readonly ip: Ip;
	/** Whether the connection is encrypted/secure (HTTPS). */
	public readonly secure: Secure;

	public body!: Body;
	public query: Query;
	public params: Params = {} as Params;
	public cookies: Cookies = {} as Cookies;

	// App & Auth State Context Containers
	public user?: User;
	public locals: Locals = {} as Locals;

	// Strongly-typed file properties
	public file?: UploadFile | undefined;
	public files?: RequestFiles | undefined;

	// Index signature for custom middleware dynamic properties
	[key: string]: any;

	constructor(native_request: IncomingMessage, options: RequestOptions = {}) {
		this.raw = native_request;
		this.method = (native_request.method || "GET").toUpperCase();
		this.url = native_request.url || "/";
		this.headers = native_request.headers;

		// Attach stream-level error listener to prevent uncaught TCP crashes
		this.raw.on("error", (streamErr) => {
			console.error(
				"[Subatom Stream Error]: Request socket issue:",
				streamErr.message,
			);
		});

		const trustProxy =
			options.trustProxy ?? process.env.SUBATOM_TRUST_PROXY === "true";

		const { protocol, host } = this.resolveOrigin(options, trustProxy);
		this.protocol = protocol as Protocol;
		this.host = host as Hostname;
		this.hostname = host.split(":")[0] || "localhost";
		this.secure = (protocol === "https") as Secure;
		this.ip = this.resolveClientIp(trustProxy) as Ip;

		// Safe Path & Query Parsing
		try {
			const parsedUrl = new URL(this.url, `${protocol}://${host}`);
			this.path = parsedUrl.pathname as Path;
			this.query = Object.fromEntries(
				parsedUrl.searchParams.entries(),
			) as Query;
		} catch (urlError) {
			throw new BadRequestError("Malformed or invalid HTTP Request URL");
		}

		// Auto-parse cookies on request initialization
		this.cookies = this.parseCookies() as Cookies;
	}

	/**
	 * Helper to retrieve a request header case-insensitively
	 */
	public get(name: string): string | undefined {
		if (!name) return undefined;
		const key = name.toLowerCase();
		const val = this.headers[key];
		if (Array.isArray(val)) {
			return val.join(", ");
		}
		return val;
	}

	/**
	 * Resolves client IP address, handling proxies when trusted.
	 */
	private resolveClientIp(trustProxy: boolean): string {
		if (trustProxy) {
			const forwardedFor = this.get("x-forwarded-for");
			if (forwardedFor) {
				const first = forwardedFor.split(",")[0] ?? "";
				return first.trim();
			}
		}
		return this.raw.socket.remoteAddress || "";
	}

	/**
	 * Reads raw stream and converts to UTF-8 String safely
	 */
	public async text(limitInBytes?: number): Promise<string> {
		const buf = await this.buffer(limitInBytes);
		return buf.toString("utf-8");
	}

	/**
	 * Safe JSON Body Parser
	 */
	public async json<T = Body>(limitInBytes?: number): Promise<T> {
		const textBody = await this.text(limitInBytes);
		if (!textBody || !textBody.trim()) {
			return {} as T;
		}

		try {
			return JSON.parse(textBody) as T;
		} catch (jsonErr: any) {
			throw new BadRequestError(
				"Invalid JSON payload provided in request body",
				{
					rawError: jsonErr.message,
				},
			);
		}
	}

	public async formData(limitInBytes?: number): Promise<URLSearchParams> {
		const textBody = await this.text(limitInBytes);
		return new URLSearchParams(textBody);
	}

	public accepts(contentType: string): boolean {
		const acceptHeader = this.get("accept");
		if (!acceptHeader) {
			return false;
		}

		const acceptedTypes = acceptHeader.split(",").map((type) => type.trim());
		return acceptedTypes.includes(contentType);
	}

	/**
	 * Resolves the real protocol and host for this request instead of a
	 * hardcoded value:
	 *   - protocol: from X-Forwarded-Proto (only if trustProxy is on),
	 *     otherwise inferred from whether the raw socket is TLS-encrypted.
	 *   - host: from X-Forwarded-Host (only if trustProxy is on),
	 *     otherwise from the standard Host header, otherwise a configured
	 *     fallback.
	 */
	private resolveOrigin(
		options: RequestOptions,
		trustProxy: boolean,
	): {
		protocol: string;
		host: string;
	} {
		const defaultHost =
			options.defaultHost || process.env.SUBATOM_DEFAULT_HOST || "localhost";

		const firstValue = (
			headerVal: string | string[] | undefined,
		): string | undefined => {
			const raw = Array.isArray(headerVal) ? headerVal[0] : headerVal;
			return raw?.split(",")[0]?.trim() || undefined;
		};

		const isEncrypted =
			(this.raw.socket as TLSSocket | undefined)?.encrypted === true;

		let protocol = isEncrypted ? "https" : "http";
		if (trustProxy) {
			const forwardedProto = firstValue(this.headers["x-forwarded-proto"]);
			if (forwardedProto) protocol = forwardedProto;
		}

		let host = firstValue(this.headers["host"]) || defaultHost;
		if (trustProxy) {
			const forwardedHost = firstValue(this.headers["x-forwarded-host"]);
			if (forwardedHost) host = forwardedHost;
		}

		return { protocol, host };
	}

	/**
	 * Safely consumes request stream into a Buffer with explicit byte size limit
	 */
	public async buffer(
		limitInBytes: number = 10 * 1024 * 1024,
	): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			const chunks: Buffer[] = [];
			let totalSize = 0;

			const onData = (chunk: Buffer) => {
				totalSize += chunk.length;
				if (totalSize > limitInBytes) {
					cleanup();
					reject(
						new PayloadTooLargeError(
							`Request payload exceeded the maximum allowed limit of ${limitInBytes} bytes`,
						),
					);
					return;
				}
				chunks.push(chunk);
			};

			const onEnd = () => {
				cleanup();
				resolve(Buffer.concat(chunks));
			};

			const onError = (err: Error) => {
				cleanup();
				reject(
					new BadRequestError(`Failed to read request stream: ${err.message}`),
				);
			};

			const cleanup = () => {
				this.raw.off("data", onData);
				this.raw.off("end", onEnd);
				this.raw.off("error", onError);
			};

			this.raw.on("data", onData);
			this.raw.on("end", onEnd);
			this.raw.on("error", onError);
		});
	}
	/**
	 * Safe HTTP Cookie Parser
	 */
	private parseCookies(): Record<string, string> {
		const cookieHeader = this.headers["cookie"];
		if (!cookieHeader || typeof cookieHeader !== "string") {
			return {};
		}

		const cookies: Record<string, string> = {};
		const pairs = cookieHeader.split(";");

		for (const pair of pairs) {
			const index = pair.indexOf("=");
			if (index > 0) {
				const key = pair.substring(0, index).trim();
				const val = pair.substring(index + 1).trim();
				try {
					cookies[key] = decodeURIComponent(val);
				} catch {
					cookies[key] = val; // Fallback to raw string if decoding fails
				}
			}
		}

		return cookies;
	}
}
