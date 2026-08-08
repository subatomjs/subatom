import type { IncomingMessage } from "node:http";
import type { IUploadFile } from "../../../types/framework/pipeline/IUploadFile.js";
import type {
	IRequest,
	RequestFiles,
	RequestOptions,
} from "../../../types/http/IRequest.js";
import { BadRequestError } from "../errors/Error.js";
import { acceptsHeader } from "./services/acceptsHeader.service.js";
import { getHeader } from "./services/getHeader.service.js";
import { parseCookies } from "./services/parseCookies.service.js";
import { readBuffer } from "./services/readBuffer.service.js";
import { readFormData } from "./services/readFormData.service.js";
import { readJson } from "./services/readJson.service.js";
import { readText } from "./services/readText.service.js";
import { resolveClientIp } from "./services/resolveClientIp.service.js";
import { resolveOrigin } from "./services/resolveOrigin.service.js";

// Import exact service per function

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
> implements
		IRequest<
			Body,
			Query,
			Params,
			Cookies,
			User,
			Locals,
			Ip,
			Protocol,
			Secure,
			Hostname,
			Path
		>
{
	public readonly raw: IncomingMessage;
	public readonly method: string;
	public readonly url: string;
	public readonly path: Path;
	public readonly headers: Record<string, string | string[] | undefined>;

	public readonly protocol: Protocol;
	public readonly host: Hostname;
	public readonly hostname: string;
	public readonly ip: Ip;
	public readonly secure: Secure;

	public body!: Body;
	public query: Query;
	public params: Params = {} as Params;
	public cookies: Cookies = {} as Cookies;

	public user?: User;
	public locals: Locals = {} as Locals;

	public file?: IUploadFile | undefined;
	public files?: RequestFiles | undefined;

	[key: string]: any;

	constructor(native_request: IncomingMessage, options: RequestOptions = {}) {
		this.raw = native_request;
		this.method = (native_request.method || "GET").toUpperCase();
		this.url = native_request.url || "/";
		this.headers = native_request.headers;

		this.raw.on("error", (streamErr) => {
			console.error(
				"[Subatom Stream Error]: Request socket issue:",
				streamErr.message,
			);
		});

		const trustProxy =
			options.trustProxy ?? process.env.SUBATOM_TRUST_PROXY === "true";

		// Delegated to resolveOrigin.service.ts
		const { protocol, host } = resolveOrigin(
			this.raw,
			this.headers,
			options,
			trustProxy,
		);
		this.protocol = protocol as Protocol;
		this.host = host as Hostname;
		this.hostname = host.split(":")[0] || "localhost";
		this.secure = (protocol === "https") as Secure;

		// Delegated to resolveClientIp.service.ts
		this.ip = resolveClientIp(this.raw, this.headers, trustProxy) as Ip;

		try {
			const parsedUrl = new URL(this.url, `${protocol}://${host}`);
			this.path = parsedUrl.pathname as Path;
			this.query = Object.fromEntries(
				parsedUrl.searchParams.entries(),
			) as Query;
		} catch (urlError) {
			throw new BadRequestError("Malformed or invalid HTTP Request URL");
		}

		// Delegated to parseCookies.service.ts
		this.cookies = parseCookies(this.headers["cookie"]) as Cookies;
	}

	// --- Methods Delegated to Individual Services ---

	public get(name: string): string | undefined {
		return getHeader(this.headers, name);
	}

	public accepts(contentType: string): boolean {
		return acceptsHeader(this.headers, contentType);
	}

	public async buffer(limitInBytes?: number): Promise<Buffer> {
		return readBuffer(this.raw, limitInBytes);
	}

	public async text(limitInBytes?: number): Promise<string> {
		return readText(this.raw, limitInBytes);
	}

	public async json<T = Body>(limitInBytes?: number): Promise<T> {
		return readJson<T>(this.raw, limitInBytes);
	}

	public async formData(limitInBytes?: number): Promise<URLSearchParams> {
		return readFormData(this.raw, limitInBytes);
	}
}
