/**
 * @fileoverview Type interface for subatom native request object (Request).
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: explanation */
import type { Readable, Writable } from "node:stream";
import type { IncomingMessage } from "node:http";
import type { ISession } from "../../../../pipelines/middlewares/types/session.types.js";
import type {
	FilesMap,
	IFileUpload,
	RequestFiles,
} from "../../../../pipelines/files/types/files.types.js";
import type {
	IPipeOptions as ReqPipeOptions,
	TypeDataListener,
	TypeEndListener,
} from "../../streams/types/stream.methods.types.js";

export type { RequestFiles, FilesMap };

export interface RequestOptions {
	trustProxy?: boolean;
	defaultHost?: string;
}

export interface IParsedAccept {
	type: string;
	subtype: string;
	q: number;
}

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
	Files = RequestFiles,
> {
	readonly raw: IncomingMessage;
	readonly method: string;
	readonly url: string;
	readonly path: Path;
	readonly headers: Record<string, string | string[] | undefined>;

	readonly protocol: Protocol;
	readonly host: Hostname;
	readonly hostname: string;
	readonly ip: Ip;
	readonly secure: Secure;

	body: Body;
	query: Query;
	params: Params;
	cookies: Cookies;

	user?: User;
	locals: Locals;

	file?: IFileUpload | undefined;
	files?: Files | undefined;

	session: ISession;
	sessionID: string;

	get(name: string): string | undefined;

	accepts(type: string): boolean;
	accepts(...types: string[]): string | false;
	accepts(types: string[]): string | false;

	text(limitInBytes?: number): Promise<string>;
	json<T = Body>(limitInBytes?: number): Promise<T>;
	formData(limitInBytes?: number): Promise<URLSearchParams>;
	buffer(limitInBytes?: number): Promise<Buffer>;

	onData(listener: TypeDataListener): () => void;
	onEnd(listener: TypeEndListener): () => void;
	pipe<T extends Writable>(destination: T, options?: ReqPipeOptions): T;
	stream(): Readable;

	[key: string]: any;
}
