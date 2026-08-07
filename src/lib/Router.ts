import { MethodNotAllowedError, NotFoundError } from "../errors/Error.js";
import { ErrorFormatter } from "../errors/errorFormatter.js";
import type { Request } from "../modules/http/Request.js";
import type { Response } from "../modules/http/Response.js";
import type {
	MatchResult,
	RouteMeta,
	TypeHandler,
	TypeRoute,
} from "../types/type_lib/typeRouter.js";

/**
 * HTTP methods that represent a terminal, request-handling route (as
 * opposed to "USE", which is middleware-only and never itself terminates
 * a request) or "ALL", which is a wildcard terminal route.
 */
const MIDDLEWARE_METHOD = "USE";
const WILDCARD_METHOD = "ALL";

export class Router {
	protected routes: TypeRoute[] = [];

	// ============================================================
	// Verb registration
	// ============================================================

	/** Support variadic handlers: router.get('/path', middleware1, middleware2, handler) */
	public get(path: string, ...handlers: TypeHandler[]): void {
		this.register_route("GET", path, handlers);
	}

	public post(path: string, ...handlers: TypeHandler[]): void {
		this.register_route("POST", path, handlers);
	}

	public put(path: string, ...handlers: TypeHandler[]): void {
		this.register_route("PUT", path, handlers);
	}

	public patch(path: string, ...handlers: TypeHandler[]): void {
		this.register_route("PATCH", path, handlers);
	}

	public delete(path: string, ...handlers: TypeHandler[]): void {
		this.register_route("DELETE", path, handlers);
	}

	public options(path: string, ...handlers: TypeHandler[]): void {
		this.register_route("OPTIONS", path, handlers);
	}

	public head(path: string, ...handlers: TypeHandler[]): void {
		this.register_route("HEAD", path, handlers);
	}

	public trace(path: string, ...handlers: TypeHandler[]): void {
		this.register_route("TRACE", path, handlers);
	}

	public connect(path: string, ...handlers: TypeHandler[]): void {
		this.register_route("CONNECT", path, handlers);
	}

	/** Registers a terminal route that matches any HTTP method. */
	public all(path: string, ...handlers: TypeHandler[]): void {
		this.register_route(WILDCARD_METHOD, path, handlers);
	}

	/**
	 * Registers path-scoped or global middleware. Unlike verb routes, "USE"
	 * entries are matched as a **path prefix** against every incoming
	 * request regardless of HTTP method, and never terminate the pipeline
	 * on their own — they run before whichever terminal route ultimately
	 * matches (see `collectUseMiddlewares` / `handleRequest`).
	 */
	public use(
		pathOrHandler: string | TypeHandler,
		...handlers: TypeHandler[]
	): void {
		if (typeof pathOrHandler === "string") {
			this.register_route(MIDDLEWARE_METHOD, pathOrHandler, handlers);
		} else if (typeof pathOrHandler === "function") {
			this.register_route(MIDDLEWARE_METHOD, "/", [pathOrHandler, ...handlers]);
		} else {
			throw new TypeError(
				"[Subatom] Router.use: first argument must be a string path or a handler function.",
			);
		}
	}

	// ============================================================
	// Route table access
	// ============================================================

	public getRoutes(): TypeRoute[] {
		return this.routes;
	}

	public clearRoutes(): void {
		this.routes = [];
	}

	/**
	 * Enterprise-grade route registration entry point that additionally accepts
	 * route metadata (tags / rateLimit spec) produced by the fluent
	 * `app.group(...)` builder in Subatom. This is the single source of truth
	 * for pushing a fully-resolved route (already prefixed, already carrying
	 * any group middlewares baked into `handlers`) onto the route table.
	 *
	 * Kept public (rather than folded silently into register_route) so callers
	 * like Subatom can attach documentation metadata without reaching into
	 * private internals or duplicating path-normalization logic.
	 */
	public registerWithMeta(
		method: string,
		path: string,
		handlers: TypeHandler[],
		meta?: RouteMeta,
	): void {
		if (!method || typeof method !== "string") {
			throw new TypeError(
				"[Subatom] Router.registerWithMeta: 'method' must be a non-empty string.",
			);
		}

		if (!Array.isArray(handlers) || handlers.length === 0) {
			throw new TypeError(
				`[Subatom] Router.registerWithMeta: route "${method.toUpperCase()} ${
					path || "/"
				}" requires at least one handler function.`,
			);
		}

		for (const handler of handlers) {
			if (typeof handler !== "function") {
				throw new TypeError(
					`[Subatom] Router.registerWithMeta: route "${method.toUpperCase()} ${
						path || "/"
					}" received a non-function handler.`,
				);
			}
		}

		const cleanPath = ("/" + (path || "/")).replace(/\/+/g, "/");

		const route: TypeRoute = {
			method: method.toUpperCase(),
			path: cleanPath,
			handlers,
		};

		if (meta?.tags && meta.tags.length > 0) {
			route.tags = meta.tags;
		}

		if (meta?.rateLimit) {
			route.rateLimit = meta.rateLimit;
		}

		this.routes.push(route);
	}

	// ============================================================
	// Matching
	// ============================================================

	/**
	 * Finds the terminal (request-handling) route for a method + URL.
	 * "USE" entries are middleware-only and are intentionally skipped here —
	 * they're collected separately by `collectUseMiddlewares` and prepended
	 * to the execution pipeline in `handleRequest`. Routes registered via
	 * `.all()` (method "ALL") match any HTTP method.
	 */
	public match(
		method: string = "GET",
		rawUrl: string = "/",
	): MatchResult | undefined {
		const pathName = this.extractPathname(rawUrl);
		const query = this.extractQuery(rawUrl);
		const targetMethod = (method || "GET").toUpperCase();

		for (const route of this.routes) {
			if (route.method === MIDDLEWARE_METHOD) continue;
			if (route.method !== targetMethod && route.method !== WILDCARD_METHOD)
				continue;

			const params = this.matchPath(route.path, pathName);
			if (params !== null) {
				return { route, params, query };
			}
		}

		return undefined;
	}

	/**
	 * Executes incoming request with a built-in Async/Sync Error Boundary Pipeline.
	 */
	public async handleRequest(
		req: Request,
		res: Response,
		globalMiddlewares: TypeHandler[] = [],
	): Promise<void> {
		try {
			const pathName = this.extractPathname(req.url || "/");
			const method = req.method || "GET";

			// Mount-scoped / global middleware registered via router.use(...),
			// matched independently of the terminal route's HTTP method.
			const { handlers: useMiddlewares, params: useParams } =
				this.collectUseMiddlewares(pathName);

			const matchResult = this.match(method, req.url || "/");

			if (!matchResult) {
				// Check if the path exists under a different HTTP method, to
				// distinguish 404 (no such route) from 405 (route exists, wrong verb).
				// "USE" entries are excluded since they're middleware mounts, not
				// routes in their own right, and would otherwise cause a false 405.
				const pathExists = this.routes.some(
					(r) =>
						r.method !== MIDDLEWARE_METHOD &&
						this.matchPath(r.path, pathName) !== null,
				);

				if (pathExists) {
					throw new MethodNotAllowedError(
						`Method ${method} not allowed on ${req.path}`,
					);
				}

				throw new NotFoundError(`Cannot ${method} ${req.path}`);
			}

			// Terminal-route params take precedence over any same-named params
			// captured by a mount-level middleware prefix. Spread is used (not
			// Object.assign) so this stays safe even if a client sends a param
			// segment literally named "__proto__" or "constructor".
			req.params = { ...useParams, ...matchResult.params };
			req.query = matchResult.query;

			const pipeline = [
				...globalMiddlewares,
				...useMiddlewares,
				...matchResult.route.handlers,
			];

			await this.runPipeline(pipeline, req, res);
		} catch (err: any) {
			// If a handler already wrote and ended the response before throwing,
			// we can't safely send another one — surface it via logs instead of
			// letting ErrorFormatter attempt a second, crash-inducing write.
			if (res.writableEnded) {
				console.error(
					"[Subatom Error]: Unhandled error occurred after the response was already sent.",
					err,
				);
				return;
			}
			ErrorFormatter.handle(err, req, res);
		}
	}

	// ============================================================
	// Internal: pipeline execution
	// ============================================================

	/**
	 * Sequential middleware/handler runner with an error boundary and
	 * defensive guards against common footguns: calling `next()` more than
	 * once, or continuing the chain after the response has already ended.
	 */
	private async runPipeline(
		handlers: TypeHandler[],
		req: Request,
		res: Response,
	): Promise<void> {
		let index = 0;
		let settled = false;

		const next = async (err?: unknown): Promise<void> => {
			if (settled) {
				// Defensive: a handler called next() again after the pipeline
				// already finished/errored. Ignore rather than double-executing
				// or throwing into an already-closed response.
				console.warn(
					"[Subatom Warning]: next() was called after the request pipeline already settled; ignoring.",
				);
				return;
			}

			if (err) {
				settled = true;
				throw err;
			}

			if (res.writableEnded || index >= handlers.length) {
				settled = true;
				return;
			}

			const handler = handlers[index++];
			if (!handler) {
				return next();
			}

			try {
				// Promise.resolve catches both synchronous throws and async promise rejections.
				await Promise.resolve(handler(req, res, next));
			} catch (handlerError) {
				settled = true;
				throw handlerError; // Bubbles up to the outer catch boundary in handleRequest.
			}
		};

		await next();
	}

	// ============================================================
	// Internal: middleware collection
	// ============================================================

	/**
	 * Gathers every "USE" middleware whose mount path is a prefix of the
	 * incoming path, in registration order, along with any params captured
	 * from dynamic segments in those mount paths (e.g. `use('/tenants/:id', ...)`).
	 */
	private collectUseMiddlewares(pathName: string): {
		handlers: TypeHandler[];
		params: Record<string, string>;
	} {
		const handlers: TypeHandler[] = [];
		const params: Record<string, string> = Object.create(null);

		for (const route of this.routes) {
			if (route.method !== MIDDLEWARE_METHOD) continue;

			const matched = this.matchPath(route.path, pathName, { prefix: true });
			if (matched !== null) {
				Object.assign(params, matched);
				handlers.push(...route.handlers);
			}
		}

		return { handlers, params };
	}

	// ============================================================
	// Internal: URL parsing
	// ============================================================

	/** Extracts the path portion of a raw URL, ignoring everything from the first "?" onward. */
	private extractPathname(rawUrl: string): string {
		const queryIndex = rawUrl.indexOf("?");
		const pathPart = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);
		return pathPart || "/";
	}

	/** Extracts and parses the query string portion of a raw URL. */
	private extractQuery(rawUrl: string): Record<string, string> {
		const queryIndex = rawUrl.indexOf("?");
		const queryString = queryIndex === -1 ? "" : rawUrl.slice(queryIndex + 1);
		const searchParams = new URLSearchParams(queryString);
		// Object.fromEntries defines properties directly (CreateDataProperty),
		// so it's already safe against a "__proto__" query key repointing the
		// object's prototype.
		return Object.fromEntries(searchParams.entries());
	}

	/**
	 * Matches a registered route path against an incoming path.
	 *
	 * - Default mode requires an exact segment-count match (terminal routes).
	 * - `{ prefix: true }` only requires the route's segments to be a prefix
	 *   of the incoming path's segments (middleware mounts registered via `use`).
	 *
	 * Returns `null` (never throws) on a non-match, including when a dynamic
	 * segment contains malformed percent-encoding that would otherwise make
	 * `decodeURIComponent` throw — a crafted URL should never be able to crash
	 * the router.
	 *
	 * The returned params object has no prototype (`Object.create(null)`), so
	 * a client sending a param literally named `__proto__` can never pollute
	 * `Object.prototype` via a plain `params[name] = value` assignment.
	 */
	private matchPath(
		routePath: string,
		incomingPath: string,
		options: { prefix?: boolean } = {},
	): Record<string, string> | null {
		const routeSegments = routePath.split("/").filter(Boolean);
		const incomingSegments = incomingPath.split("/").filter(Boolean);

		if (options.prefix) {
			if (routeSegments.length > incomingSegments.length) return null;
		} else if (routeSegments.length !== incomingSegments.length) {
			return null;
		}

		const params: Record<string, string> = Object.create(null);

		for (let i = 0; i < routeSegments.length; i++) {
			const routeSeg = routeSegments[i];
			const incomingSeg = incomingSegments[i];

			if (!routeSeg || !incomingSeg) return null;

			if (routeSeg.startsWith(":")) {
				const paramName = routeSeg.slice(1);
				if (!paramName) return null;

				try {
					params[paramName] = decodeURIComponent(incomingSeg);
				} catch {
					return null;
				}
			} else if (routeSeg !== incomingSeg) {
				return null;
			}
		}

		return params;
	}

	/**
	 * Legacy internal registration path. Delegates to registerWithMeta so
	 * there is a single, well-validated code path for pushing routes onto
	 * the table (avoids logic drift / duplicated bugs between the two).
	 */
	private register_route(
		method: string,
		path: string,
		handlers: TypeHandler[],
	): void {
		this.registerWithMeta(method, path, handlers);
	}
}
