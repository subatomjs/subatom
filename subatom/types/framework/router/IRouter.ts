import type { IRequest } from "../../http/IRequest.js";
import type { IResponse } from "../../http/IResponse.js";
import type { NextFunction } from "../pipeline/INext.js";

/**
 * `next` accepts an optional error — passing one short-circuits the
 * pipeline into the error boundary (see `Router.runPipeline`). Handlers
 * that want to propagate an error via `next(err)` need this parameter
 * present in the type, or `next(err)` fails to compile for consumers.
 */
export type IHandler = (
	req: IRequest,
	res: IResponse,
	next: NextFunction,
) => void | Promise<void>;

export interface IRoute {
	method: string;
	path: string;
	handlers: IHandler[];
	tags?: string[];
	rateLimit?: string;
}

export interface IMatchResult {
	route: IRoute;
	params: Record<string, string>;
	query: Record<string, string>;
}

export interface IRouteMeta {
	tags?: string[] | undefined;
	rateLimit?: string | undefined;
}

/**
 * The public contract for a Router. Type against this —
 * `const router: IRouter = new Router()` — rather than the concrete
 * `Router` class, which also exposes path-matching/pipeline internals
 * you shouldn't need to touch directly.
 */
export interface IRouter {
	get(path: string, ...handlers: IHandler[]): void;
	post(path: string, ...handlers: IHandler[]): void;
	put(path: string, ...handlers: IHandler[]): void;
	patch(path: string, ...handlers: IHandler[]): void;
	delete(path: string, ...handlers: IHandler[]): void;
	options(path: string, ...handlers: IHandler[]): void;
	head(path: string, ...handlers: IHandler[]): void;
	trace(path: string, ...handlers: IHandler[]): void;
	connect(path: string, ...handlers: IHandler[]): void;

	/**
	 * QUERY — the proposed HTTP method (IETF draft "The HTTP QUERY
	 * Method") for safe, idempotent requests that carry a body. Useful
	 * when a search/filter payload is too complex or too large for a
	 * GET query string, but the semantics should still be read-only and
	 * cacheable like GET rather than mutating like POST. Registers a
	 * terminal route matched only against `QUERY` requests, same shape
	 * as `get`/`post`.
	 */
	query(path: string, ...handlers: IHandler[]): void;

	/** Registers a terminal route that matches any HTTP method. */
	all(path: string, ...handlers: IHandler[]): void;

	/** Registers path-scoped or global middleware. */
	use(pathOrHandler: string | IHandler, ...handlers: IHandler[]): void;

	getRoutes(): IRoute[];
	clearRoutes(): void;

	registerWithMeta(
		method: string,
		path: string,
		handlers: IHandler[],
		meta?: IRouteMeta,
	): void;

	match(method?: string, rawUrl?: string): IMatchResult | undefined;

	handleRequest(
		req: IRequest,
		res: IResponse,
		globalMiddlewares?: IHandler[],
	): Promise<void>;
}
