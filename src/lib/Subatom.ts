import { configEnv, type EnvOptions, env } from "../config/env.js";
import type { Request } from "../modules/http/Request.js";
import type { Response as SubatomResponse } from "../modules/http/Response.js";
import type { RouteMeta, TypeHandler } from "../types/type_lib/typeRouter.js";
import { Router } from "./Router.js";
import { SubatomServer } from "./SubatomServer.js";

export type MiddlewareHandler = (
	req: Request<any, any, any, any>,
	res: SubatomResponse,
	next: (err?: any) => void | Promise<void>,
) => void | Promise<void>;

export type ErrorMiddlewareHandler = (
	err: any,
	req: Request<any, any, any, any>,
	res: SubatomResponse,
	next: (err?: any) => void | Promise<void>,
) => void | Promise<void>;

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Resolved, fully-merged context for whatever route group is currently
 * "active" while a group() callback is executing. Sits on Subatom.groupContextStack.
 */
interface GroupContext {
	prefix: string;
	middlewares: MiddlewareHandler[];
	tags: string[];
	// Explicit `| undefined` (not just `?`) — under exactOptionalPropertyTypes
	// this field is built from `a ?? b` expressions that are typed
	// `string | undefined`, so the property itself must say so too.
	rateLimitSpec: string | undefined;
}

/**
 * Collapses a path segment to a normalized `/foo/bar` form with no
 * duplicate/trailing slashes. Treats null/undefined/"/" as "no contribution"
 * so it can be safely combined in combinePaths without special-casing.
 */
function normalizePathSegment(segment?: string | null): string {
	if (segment === null || segment === undefined) return "";
	const trimmed = String(segment).trim();
	if (trimmed.length === 0 || trimmed === "/") return "";

	const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
	const collapsed = withLeadingSlash.replace(/\/{2,}/g, "/");
	return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}

/**
 * Joins any number of path segments (group prefixes, sub-prefixes, route
 * paths) into a single clean, absolute path. Always returns at least "/".
 */
export function combinePaths(
	...segments: Array<string | undefined | null>
): string {
	const joined = segments
		.map((segment) => normalizePathSegment(segment))
		.filter((segment) => segment.length > 0)
		.join("");

	return joined.length === 0 ? "/" : joined;
}

interface ParsedRateLimit {
	limit: number;
	windowMs: number;
}

/**
 * Parses human-friendly rate limit specs like "100/min", "10/sec", "1000/hour".
 * Fails fast (throws) at route-definition time rather than at request time,
 * so a typo surfaces immediately during app startup instead of silently
 * disabling protection in production.
 */
export function parseRateLimitSpec(spec: string): ParsedRateLimit {
	if (typeof spec !== "string" || spec.trim().length === 0) {
		throw new TypeError(
			`[Subatom] rateLimit() requires a non-empty string like "100/min".`,
		);
	}

	const match = /^(\d+)\s*\/\s*([a-zA-Z]+)$/.exec(spec.trim());

	if (!match) {
		throw new TypeError(
			`[Subatom] Invalid rate limit specification "${spec}". Expected a format like "100/min".`,
		);
	}

	const limit = Number(match[1]);
	const unit = match[2]!.toLowerCase();

	if (!Number.isFinite(limit) || limit <= 0) {
		throw new TypeError(
			`[Subatom] Invalid rate limit count in "${spec}". Must be a positive integer.`,
		);
	}

	let windowMs: number;
	switch (unit) {
		case "ms":
		case "millisecond":
		case "milliseconds":
			windowMs = 1;
			break;
		case "s":
		case "sec":
		case "secs":
		case "second":
		case "seconds":
			windowMs = 1_000;
			break;
		case "m":
		case "min":
		case "mins":
		case "minute":
		case "minutes":
			windowMs = 60_000;
			break;
		case "h":
		case "hr":
		case "hrs":
		case "hour":
		case "hours":
			windowMs = 3_600_000;
			break;
		case "d":
		case "day":
		case "days":
			windowMs = 86_400_000;
			break;
		default:
			throw new TypeError(
				`[Subatom] Invalid rate limit unit "${unit}" in "${spec}". Supported units: ms, s, m, h, d.`,
			);
	}

	return { limit, windowMs };
}

/**
 * Builds a self-contained, fixed-window rate limiting middleware from a spec
 * like "100/min". Enterprise-safety notes:
 *  - Buckets are keyed defensively (falls back through several possible
 *    request shapes) so a missing `req.ip` never throws.
 *  - A periodic, unref'd sweep evicts expired buckets so the in-memory Map
 *    cannot grow unbounded (prevents the classic naive rate-limiter memory leak).
 *  - Internal failures fail OPEN (request is allowed through, error logged)
 *    rather than taking down the request pipeline — a bug in the limiter
 *    must never become a full outage.
 */
export function createRateLimitMiddleware(spec: string): MiddlewareHandler {
	const { limit, windowMs } = parseRateLimitSpec(spec);
	const buckets = new Map<string, { count: number; resetAt: number }>();

	const sweepIntervalMs = Math.max(windowMs, 1_000);
	const sweepTimer = setInterval(() => {
		const now = Date.now();
		for (const [key, bucket] of buckets) {
			if (bucket.resetAt <= now) {
				buckets.delete(key);
			}
		}
	}, sweepIntervalMs);

	// Never let this background timer keep the Node process alive.
	if (typeof sweepTimer.unref === "function") {
		sweepTimer.unref();
	}

	return (req, res, next) => {
		try {
			const clientKey: string =
				(req as any)?.ip ||
				(req as any)?.rawRequest?.socket?.remoteAddress ||
				(req as any)?.rawRequest?.headers?.["x-forwarded-for"] ||
				"unknown";

			const now = Date.now();
			let bucket = buckets.get(clientKey);

			if (!bucket || bucket.resetAt <= now) {
				bucket = { count: 0, resetAt: now + windowMs };
				buckets.set(clientKey, bucket);
			}

			bucket.count += 1;

			const rawRes = (res as any)?.rawResponse;
			const remaining = Math.max(limit - bucket.count, 0);

			if (
				rawRes &&
				typeof rawRes.setHeader === "function" &&
				!rawRes.headersSent
			) {
				rawRes.setHeader("X-RateLimit-Limit", String(limit));
				rawRes.setHeader("X-RateLimit-Remaining", String(remaining));
				rawRes.setHeader(
					"X-RateLimit-Reset",
					String(Math.ceil(bucket.resetAt / 1000)),
				);
			}

			if (bucket.count > limit) {
				const retryAfterSec = Math.max(
					Math.ceil((bucket.resetAt - now) / 1000),
					1,
				);

				if (rawRes && !rawRes.writableEnded) {
					rawRes.setHeader?.("Retry-After", String(retryAfterSec));
					rawRes.writeHead(429, { "Content-Type": "application/json" });
					rawRes.end(
						JSON.stringify({
							error: "Too Many Requests",
							message: `Rate limit of ${limit} requests per ${windowMs}ms exceeded.`,
							retryAfter: retryAfterSec,
						}),
					);
				}
				return;
			}

			return next();
		} catch (rateLimitError) {
			// Fail-open: a bug in the limiter should never block legitimate traffic.
			console.error(
				"[Subatom Warning]: Rate limiter middleware failed, allowing request through:",
				rateLimitError,
			);
			return next();
		}
	};
}

export class Subatom {
	private readonly router = new Router();
	private readonly middlewares: MiddlewareHandler[] = [];
	private readonly errorMiddlewares: ErrorMiddlewareHandler[] = [];
	private serverInstance?: SubatomServer;

	/**
	 * Stack of "currently active" route-group contexts. Pushed onto when a
	 * group()'s callback starts executing, popped when it finishes — this is
	 * what lets plain `app.get(...)` calls made *inside* a group callback
	 * automatically pick up the right prefix / middleware / tags without the
	 * caller having to reference the group builder directly.
	 */
	private readonly groupContextStack: GroupContext[] = [];

	constructor(envOptions?: EnvOptions) {
		// 1. Initialize configuration
		configEnv(envOptions);

		// 2. Register process-level disaster recovery hooks
		this.registerProcessBoundary();
	}

	// Registers global, sub-router, or path-prefixed middlewares
	public use(fnOrPrefix: any, maybeRouter?: any): this {
		if (typeof fnOrPrefix === "function") {
			// Check signature for error middleware: (err, req, res, next) -> 4 parameters
			if (fnOrPrefix.length === 4) {
				this.errorMiddlewares.push(fnOrPrefix);
			} else {
				this.middlewares.push(fnOrPrefix);
			}
		} else if (typeof fnOrPrefix === "string" && maybeRouter) {
			// Sub-router with prefix: app.use('/api', subRouter)
			const prefix = fnOrPrefix;
			for (const route of maybeRouter.getRoutes()) {
				const fullPath = combinePaths(prefix, route.path);
				this.router.getRoutes().push({
					method: route.method,
					path: fullPath,
					handlers: route.handlers,
					// Only include tags/rateLimit keys when actually present — under
					// exactOptionalPropertyTypes, writing `rateLimit: undefined`
					// explicitly is a type error even though the field is optional.
					...(route.tags !== undefined ? { tags: route.tags } : {}),
					...(route.rateLimit !== undefined
						? { rateLimit: route.rateLimit }
						: {}),
				});
			}
		} else if (fnOrPrefix instanceof Router) {
			// Sub-router without prefix: app.use(subRouter)
			for (const route of fnOrPrefix.getRoutes()) {
				this.router.getRoutes().push(route);
			}
		}
		return this;
	}

	/**
	 * Router group with prefix + explicit Router instance (legacy/simple form):
	 *   app.group('/api', subRouter)
	 *
	 * Router group as a fluent, chainable builder (new form):
	 *   app.group('/api').prefix('/v1').middleware(auth).tag('API').rateLimit('100/min').group(() => { ... })
	 *
	 * Both forms are supported via overloads distinguished at runtime by
	 * whether a real Router instance was passed as the second argument.
	 */
	public group(prefix: string, router: Router): this;
	public group(prefix?: string): RouteGroupBuilder;
	public group(prefix?: string, router?: Router): this | RouteGroupBuilder {
		if (router !== undefined) {
			if (!(router instanceof Router)) {
				throw new TypeError(
					"[Subatom] app.group(prefix, router) expects the second argument to be a Router instance.",
				);
			}

			const safePrefix = typeof prefix === "string" ? prefix : "";

			for (const route of router.getRoutes()) {
				const fullPath = combinePaths(safePrefix, route.path);
				this.router.getRoutes().push({
					method: route.method,
					path: fullPath,
					handlers: route.handlers,
					...(route.tags !== undefined ? { tags: route.tags } : {}),
					...(route.rateLimit !== undefined
						? { rateLimit: route.rateLimit }
						: {}),
				});
			}

			return this;
		}

		if (prefix !== undefined && typeof prefix !== "string") {
			throw new TypeError(
				"[Subatom] app.group(prefix) expects 'prefix' to be a string.",
			);
		}

		return new RouteGroupBuilder(this, prefix ?? "");
	}

	/**
	 * Explicit registration for user-defined Error Middlewares
	 */
	public useError(handler: ErrorMiddlewareHandler): this {
		this.errorMiddlewares.push(handler);
		return this;
	}

	// Direct Route Registrations
	public get(path: string, ...handlers: TypeHandler[]): this {
		return this.registerPossiblyGrouped("GET", path, handlers);
	}

	public post(path: string, ...handlers: TypeHandler[]): this {
		return this.registerPossiblyGrouped("POST", path, handlers);
	}

	public put(path: string, ...handlers: TypeHandler[]): this {
		return this.registerPossiblyGrouped("PUT", path, handlers);
	}

	public patch(path: string, ...handlers: TypeHandler[]): this {
		return this.registerPossiblyGrouped("PATCH", path, handlers);
	}

	public delete(path: string, ...handlers: TypeHandler[]): this {
		return this.registerPossiblyGrouped("DELETE", path, handlers);
	}

	/**
	 * Starts the Subatom Server with the full Error Pipeline
	 */
	public listen(port: number = 3000, host?: string, appName?: string) {
		this.serverInstance = new SubatomServer(
			this.router,
			this.middlewares,
			this.errorMiddlewares,
		);
		return this.serverInstance.listen(port, host, appName);
	}

	/**
	 * Enterprise Process Boundary Safety Net
	 * Intercepts unhandled promise rejections and system-level crashes
	 */
	private registerProcessBoundary(): void {
		process.on("unhandledRejection", (reason: any) => {
			// First, see if this rejection can be traced back to a still-open
			// request/response pair (e.g. a middleware that called next() from an
			// un-awaited callback). If so, the client gets a proper error
			// response instead of a hung socket, and we don't need to treat this
			// as a fatal, unattributable process error.
			const recovered =
				this.serverInstance?.tryRecoverFromOrphanedRejection(reason);

			if (recovered) {
				return;
			}

			console.error(
				"\n🔥 [Subatom Process Error] Unhandled Promise Rejection Detected:",
			);
			console.error(reason?.stack || reason);

			// In production, record diagnostic details to APM/Logs
		});

		process.on("uncaughtException", (error: Error) => {
			console.error(
				"\n💥 [Subatom Fatal Error] Uncaught Synchronous Exception:",
			);
			console.error(error.stack || error.message);

			if (env.isProd) {
				console.error("Initiating emergency graceful shutdown...");
				this.gracefulShutdown(1);
			}
		});

		// Handle termination signals
		process.on("SIGINT", () => this.gracefulShutdown(0));
		process.on("SIGTERM", () => this.gracefulShutdown(0));
	}

	/**
	 * Gracefully shuts down the application
	 */
	public gracefulShutdown(exitCode: number = 0): void {
		console.log("[Subatom] Shutting down active connections...");
		if (this.serverInstance) {
			this.serverInstance.close(() => {
				console.log("[Subatom] Server successfully closed.");
				process.exit(exitCode);
			});
		} else {
			process.exit(exitCode);
		}
	}

	// ---------------------------------------------------------------------
	// Internal helpers backing the fluent group() API. Prefixed with an
	// underscore to signal "internal use by RouteGroupBuilder only" while
	// still being real public members (TypeScript has no true friend-class
	// mechanism, so this is the pragmatic, well-documented equivalent).
	// ---------------------------------------------------------------------

	/** @internal */
	public _currentGroupContext(): GroupContext | undefined {
		return this.groupContextStack[this.groupContextStack.length - 1];
	}

	/** @internal */
	public _pushGroupContext(context: GroupContext): void {
		this.groupContextStack.push(context);
	}

	/** @internal */
	public _popGroupContext(): void {
		this.groupContextStack.pop();
	}

	/** @internal Registers a route that has already been fully resolved (prefixed path + merged middlewares) by a RouteGroupBuilder. */
	public _registerGroupRoute(
		method: HttpMethod,
		fullPath: string,
		handlers: TypeHandler[],
		meta: RouteMeta,
	): void {
		const cleanMeta: Partial<Pick<any, "tags" | "rateLimit">> = {};
		if (meta.tags !== undefined) cleanMeta.tags = meta.tags;
		if (meta.rateLimit !== undefined) cleanMeta.rateLimit = meta.rateLimit;
		this.router.registerWithMeta(method, fullPath, handlers, cleanMeta);
	}

	/**
	 * Shared implementation for app.get/post/put/patch/delete. If called while
	 * a group() callback is active (groupContextStack non-empty), the route is
	 * automatically prefixed and gets the group's middlewares/tags/rate limit
	 * applied. Otherwise it behaves exactly like a plain top-level route.
	 */
	private registerPossiblyGrouped(
		method: HttpMethod,
		path: string,
		handlers: TypeHandler[],
	): this {
		if (typeof path !== "string" || path.length === 0) {
			throw new TypeError(
				`[Subatom] Route path for ${method} must be a non-empty string.`,
			);
		}

		if (!Array.isArray(handlers) || handlers.length === 0) {
			throw new TypeError(
				`[Subatom] Route "${method} ${path}" requires at least one handler function.`,
			);
		}

		const context = this._currentGroupContext();

		if (context) {
			const fullPath = combinePaths(context.prefix, path);
			// MiddlewareHandler and TypeHandler are structurally call-compatible
			// (both are (req, res, next) => void|Promise<void>; the only
			// difference is next()'s optional error param, which is irrelevant at
			// runtime in JS). Safe to merge into a single TypeHandler[] pipeline.
			const combinedHandlers = [
				...context.middlewares,
				...handlers,
			] as unknown as TypeHandler[];

			const groupMeta: Partial<Pick<any, "tags" | "rateLimit">> = {};
			if (context.tags.length > 0) groupMeta.tags = context.tags;
			if (context.rateLimitSpec !== undefined)
				groupMeta.rateLimit = context.rateLimitSpec;
			this.router.registerWithMeta(
				method,
				fullPath,
				combinedHandlers,
				groupMeta,
			);
		} else {
			this.router.registerWithMeta(method, path, handlers, {});
		}

		return this;
	}
}

/**
 * Fluent, chainable route-group builder returned by `app.group(prefix)`.
 *
 * Example:
 *   app.group("/api")
 *      .prefix("/v1")
 *      .middleware(auth)
 *      .tag("API")
 *      .rateLimit("100/min")
 *      .group(() => {
 *          app.group("/users")
 *             .middleware(userMiddleware)
 *             .tag("Users")
 *             .group(() => {
 *                 app.get("/", getUsers);
 *             });
 *      });
 *
 * Nested `app.group(...)` calls made inside a `.group(callback)` body
 * automatically inherit the parent's prefix, middlewares, and tags by
 * reading the app's active group-context stack.
 */
export class RouteGroupBuilder {
	private ownPrefix: string;
	private readonly ownMiddlewares: MiddlewareHandler[] = [];
	private readonly ownTags: string[] = [];
	private ownRateLimitSpec: string | undefined;

	constructor(
		private readonly app: Subatom,
		prefix: string = "",
	) {
		if (typeof prefix !== "string") {
			throw new TypeError("[Subatom] group() prefix must be a string.");
		}
		this.ownPrefix = prefix;
	}

	/** Appends an additional path segment to this group's prefix. Chainable. */
	public prefix(segment: string): this {
		if (typeof segment !== "string") {
			throw new TypeError("[Subatom] .prefix() expects a string argument.");
		}
		this.ownPrefix = combinePaths(this.ownPrefix, segment);
		return this;
	}

	/**
	 * Registers one or more middlewares for this group. Accepts individual
	 * functions and/or arrays of functions. Chainable.
	 */
	public middleware(
		...handlers: Array<MiddlewareHandler | MiddlewareHandler[]>
	): this {
		for (const entry of handlers) {
			if (Array.isArray(entry)) {
				for (const fn of entry) {
					this.assertIsFunction(fn, "middleware");
					this.ownMiddlewares.push(fn);
				}
			} else {
				this.assertIsFunction(entry, "middleware");
				this.ownMiddlewares.push(entry);
			}
		}
		return this;
	}

	/**
	 * Attaches documentation/grouping tags (e.g. for OpenAPI generation or
	 * route listings). Purely metadata — never affects request handling.
	 */
	public tag(...tags: Array<string | string[]>): this {
		for (const entry of tags) {
			if (Array.isArray(entry)) {
				for (const t of entry) {
					if (typeof t === "string" && t.trim().length > 0) {
						this.ownTags.push(t.trim());
					}
				}
			} else if (typeof entry === "string" && entry.trim().length > 0) {
				this.ownTags.push(entry.trim());
			}
		}
		return this;
	}

	/**
	 * Applies rate limiting to every route in this group (and, once nested via
	 * .group(), to descendant groups too — unless a descendant overrides it
	 * with its own .rateLimit() call). Spec format: "<count>/<unit>", e.g.
	 * "100/min", "10/sec", "1000/hour".
	 */
	public rateLimit(spec: string): this {
		// Parse eagerly so a malformed spec fails fast at app-definition time.
		parseRateLimitSpec(spec);
		this.ownRateLimitSpec = spec;
		this.ownMiddlewares.push(createRateLimitMiddleware(spec));
		return this;
	}

	public get(path: string, ...handlers: TypeHandler[]): this {
		this.registerDirect("GET", path, handlers);
		return this;
	}

	public post(path: string, ...handlers: TypeHandler[]): this {
		this.registerDirect("POST", path, handlers);
		return this;
	}

	public put(path: string, ...handlers: TypeHandler[]): this {
		this.registerDirect("PUT", path, handlers);
		return this;
	}

	public patch(path: string, ...handlers: TypeHandler[]): this {
		this.registerDirect("PATCH", path, handlers);
		return this;
	}

	public delete(path: string, ...handlers: TypeHandler[]): this {
		this.registerDirect("DELETE", path, handlers);
		return this;
	}

	/**
	 * Opens this group as the "active" context and, if a callback is given,
	 * runs it synchronously — any `app.get/post/put/patch/delete` (and nested
	 * `app.group(...)`) calls made inside will automatically inherit this
	 * group's prefix/middlewares/tags/rateLimit.
	 *
	 * The context is always popped afterwards, even if the callback throws,
	 * so a single misbehaving group definition can never corrupt route
	 * registration for the rest of the app.
	 */
	public group(callback?: () => void | Promise<void>): this {
		if (callback !== undefined && typeof callback !== "function") {
			throw new TypeError(
				"[Subatom] .group() expects its argument to be a function, if provided.",
			);
		}

		const context = this.buildContext();
		this.app._pushGroupContext(context);

		try {
			if (callback) {
				const maybePromise = callback();
				// Detect an accidentally-async callback (a real coding mistake we
				// want to catch fast) without ever testing a `void`-typed value for
				// truthiness — TS rightly flags that as almost certainly a bug, so
				// we use explicit equality checks instead.
				if (
					maybePromise !== undefined &&
					maybePromise !== null &&
					typeof (maybePromise as unknown as Promise<unknown>).then ===
						"function"
				) {
					throw new TypeError(
						"[Subatom] Route group callbacks must be synchronous. An async " +
							"callback can interleave with other route registrations and " +
							"corrupt the group context stack.",
					);
				}
			}
		} finally {
			this.app._popGroupContext();
		}

		return this;
	}

	private registerDirect(
		method: HttpMethod,
		path: string,
		handlers: TypeHandler[],
	): void {
		if (typeof path !== "string" || path.length === 0) {
			throw new TypeError(
				`[Subatom] Route path for ${method} must be a non-empty string.`,
			);
		}

		if (!Array.isArray(handlers) || handlers.length === 0) {
			throw new TypeError(
				`[Subatom] Route "${method} ${path}" requires at least one handler function.`,
			);
		}

		const context = this.buildContext();
		const fullPath = combinePaths(context.prefix, path);
		const combinedHandlers = [
			...context.middlewares,
			...handlers,
		] as unknown as TypeHandler[];

		this.app._registerGroupRoute(method, fullPath, combinedHandlers, {
			tags: context.tags,
			rateLimit: context.rateLimitSpec,
		});
	}

	/**
	 * Merges this builder's own accumulated prefix/middlewares/tags/rateLimit
	 * with whatever group context is currently active on the app (i.e. the
	 * parent group, if this builder was created inside another group's
	 * callback). Recomputed on demand rather than cached, so it always
	 * reflects the current parent context at call time.
	 */
	private buildContext(): GroupContext {
		const parent = this.app._currentGroupContext();

		const prefix = combinePaths(parent?.prefix, this.ownPrefix);
		const middlewares: MiddlewareHandler[] = [
			...(parent?.middlewares ?? []),
			...this.ownMiddlewares,
		];
		const tags: string[] = [...(parent?.tags ?? []), ...this.ownTags];
		const rateLimitSpec = this.ownRateLimitSpec ?? parent?.rateLimitSpec;

		return { prefix, middlewares, tags, rateLimitSpec };
	}

	private assertIsFunction(value: unknown, label: string): void {
		if (typeof value !== "function") {
			throw new TypeError(
				`[Subatom] .${label}() only accepts functions (or arrays of functions).`,
			);
		}
	}
}
