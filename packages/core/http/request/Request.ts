/**
 * @fileoverview The Request.ts is a scaffolding of Incoming request from node.js
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IncomingMessage } from "node:http";
import type { Readable, Writable } from "node:stream";
import type { ISession } from "../../../pipelines/middlewares/types/session.types.js";
import type { IFileUpload } from "../../../pipelines/files/types/files.types.js";
import type {
	IRequest,
	RequestFiles,
	RequestOptions,
} from "./types/request.types.js";
import { BadRequestError } from "../../../errors/Errors.js";

import {
	type TypeDataListener,
	type TypeEndListener,
	type IPipeOptions as ReqPipeOptions,
	reqOnData,
	reqOnEnd,
	reqPipe,
	reqStream,
} from "../streams/methods/index.js";

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
	Query = Record<string, string | string[]>,
	Params = Record<string, string>,
	Cookies = Record<string, string>,
	User = unknown,
	Locals = Record<string, unknown>,
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

	public file?: IFileUpload | undefined;
	public files?: RequestFiles | undefined;

	constructor(native_request: IncomingMessage, options: RequestOptions = {}) {
		this.raw = native_request;
		this.method = (native_request.method || "GET").toUpperCase();
		this.url = native_request.url || "/";
		this.headers = native_request.headers;

		const onStreamError = (streamErr: Error) => {
			console.error(
				"[Subatom Stream Error]: Request socket issue:",
				streamErr.message,
			);
		};
		const cleanupStreamListeners = () => {
			this.raw.off("error", onStreamError);
			this.raw.off("close", cleanupStreamListeners);
		};
		this.raw.on("error", onStreamError);
		this.raw.once("close", cleanupStreamListeners);

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
		// Defensive fallback: a host with an empty leading segment also fails URL parsing below.
		/* v8 ignore next */
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
		} catch (_urlError: unknown) {
			throw new BadRequestError("Malformed or invalid HTTP Request URL");
		}

		// Delegated to parseCookies.service.ts
		this.cookies = parseCookies(this.headers.cookie) as Cookies;
	}

	public session!: ISession;
	public sessionID!: string;

	// --- Methods Delegated to Individual Services ---

	public get(name: string): string | undefined {
		return getHeader(this.headers, name);
	}

	// Inside src/request/Request.ts

	/**
	 * Checks if the request's Accept header matches the given type(s).
	 * - If a single string is passed, returns a boolean (`true`/`false`).
	 * - If multiple strings are passed, returns the best matching string, or `false` if none match.
	 */
	/**
	 * Checks if the request's Accept header matches the given type(s).
	 * - If a single string is passed, returns a boolean (`true`/`false`).
	 * - If multiple strings or an array of strings are passed, returns the best matching string, or `false` if none match.
	 */
	public accepts(type: string): boolean;
	public accepts(...types: string[]): string | false;
	public accepts(types: string[]): string | false;
	public accepts(...args: (string | string[])[]): boolean | string | false {
		const flattened: string[] = [];

		for (const arg of args) {
			if (Array.isArray(arg)) {
				flattened.push(...arg);
			} else if (typeof arg === "string") {
				flattened.push(arg);
			}
		}

		// Single string check -> return boolean
		if (args.length === 1 && typeof args[0] === "string") {
			return acceptsHeader(this.headers, args[0]);
		}

		// Multiple types negotiation -> return matched string or false
		for (const type of flattened) {
			if (acceptsHeader(this.headers, type)) {
				return type;
			}
		}

		return false;
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

	// --- Streaming Methods ---

	public onData(listener: TypeDataListener): () => void {
		return reqOnData(this.raw, listener);
	}

	public onEnd(listener: TypeEndListener): () => void {
		return reqOnEnd(this.raw, listener);
	}

	public pipe<T extends Writable>(destination: T, options?: ReqPipeOptions): T {
		return reqPipe(this.raw, destination, options);
	}

	public stream(): Readable {
		return reqStream(this.raw);
	}
}
