import type {
	IHandler,
	IMatchResult,
	IRoute,
	IRouteMeta,
	IRouter,
} from "../../types/framework/router/IRouter.js";
import type { IRequest } from "../../types/http/IRequest.js";
import type { IResponse } from "../../types/http/IResponse.js";
import {
	MethodNotAllowedError,
	NotFoundError,
	normalizeError,
} from "../http/errors/Error.js";
import { ErrorFormatter } from "../http/errors/errorFormatter.js";
import { Next } from "../pipeline/next-pipeline/Next.js";

// // Single-purpose service function imports
// import { extractPathname } from "./services/urlParser.service.js";
// import { matchPath } from "./services/pathMatcher.service.js";
// import { registerWithMeta } from "./services/routeRegistry.service.js";
// import { collectUseMiddlewares } from "./services/middlewareCollector.service.js";
// import { normalizeError } from "./services/errorNormalizer.service.js";
// import { runPipeline } from "./services/pipelineRunner.service.js";
// import { matchRoute } from "./services/routeMatcher.service.js";

// const MIDDLEWARE_METHOD = "USE";
// const WILDCARD_METHOD = "ALL";
// const QUERY_METHOD = "QUERY";

// export class Router implements IRouter {
//   protected routes: IRoute[] = [];

//   // ============================================================
//   // Verb registration
//   // ============================================================

//   public get(path: string, ...handlers: IHandler[]): void {
//     this.register_route("GET", path, handlers);
//   }

//   public post(path: string, ...handlers: IHandler[]): void {
//     this.register_route("POST", path, handlers);
//   }

//   public put(path: string, ...handlers: IHandler[]): void {
//     this.register_route("PUT", path, handlers);
//   }

//   public patch(path: string, ...handlers: IHandler[]): void {
//     this.register_route("PATCH", path, handlers);
//   }

//   public delete(path: string, ...handlers: IHandler[]): void {
//     this.register_route("DELETE", path, handlers);
//   }

//   public options(path: string, ...handlers: IHandler[]): void {
//     this.register_route("OPTIONS", path, handlers);
//   }

//   public head(path: string, ...handlers: IHandler[]): void {
//     this.register_route("HEAD", path, handlers);
//   }

//   public trace(path: string, ...handlers: IHandler[]): void {
//     this.register_route("TRACE", path, handlers);
//   }

//   public connect(path: string, ...handlers: IHandler[]): void {
//     this.register_route("CONNECT", path, handlers);
//   }

//   public query(path: string, ...handlers: IHandler[]): void {
//     this.register_route(QUERY_METHOD, path, handlers);
//   }

//   public all(path: string, ...handlers: IHandler[]): void {
//     this.register_route(WILDCARD_METHOD, path, handlers);
//   }

//   public use(pathOrHandler: string | IHandler, ...handlers: IHandler[]): void {
//     if (typeof pathOrHandler === "string") {
//       this.register_route(MIDDLEWARE_METHOD, pathOrHandler, handlers);
//     } else if (typeof pathOrHandler === "function") {
//       this.register_route(MIDDLEWARE_METHOD, "/", [pathOrHandler, ...handlers]);
//     } else {
//       throw new TypeError(
//         "[Subatom] Router.use: first argument must be a string path or a handler function.",
//       );
//     }
//   }

//   // ============================================================
//   // Route table access
//   // ============================================================

//   public getRoutes(): IRoute[] {
//     return this.routes;
//   }

//   public clearRoutes(): void {
//     this.routes = [];
//   }

//   public registerWithMeta(
//     method: string,
//     path: string,
//     handlers: IHandler[],
//     meta?: IRouteMeta,
//   ): void {
//     registerWithMeta(this.routes, method, path, handlers, meta);
//   }

//   // ============================================================
//   // Matching
//   // ============================================================

//   public match(
//     method: string = "GET",
//     rawUrl: string = "/",
//   ): IMatchResult | undefined {
//     return matchRoute(this.routes, method, rawUrl);
//   }

//   // ============================================================
//   // Execution
//   // ============================================================

//   public async handleRequest(
//     req: IRequest,
//     res: IResponse,
//     globalMiddlewares: IHandler[] = [],
//   ): Promise<void> {
//     try {
//       const pathName = extractPathname(req.url || "/");
//       const method = req.method || "GET";

//       const { handlers: useMiddlewares, params: useParams } =
//         collectUseMiddlewares(this.routes, pathName);

//       const matchResult = this.match(method, req.url || "/");

//       if (!matchResult) {
//         const pathExists = this.routes.some(
//           (r) =>
//             r.method !== MIDDLEWARE_METHOD &&
//             matchPath(r.path, pathName) !== null,
//         );

//         if (pathExists) {
//           throw new MethodNotAllowedError(
//             `Method ${method} not allowed on ${req.path}`,
//           );
//         }

//         throw new NotFoundError(`Cannot ${method} ${req.path}`);
//       }

//       req.params = { ...useParams, ...matchResult.params };
//       req.query = matchResult.query;

//       const pipeline = [
//         ...globalMiddlewares,
//         ...useMiddlewares,
//         ...matchResult.route.handlers,
//       ];

//       await runPipeline(pipeline, req, res);
//     } catch (err: unknown) {
//       if (res.writableEnded) {
//         console.error(
//           "[Subatom Error]: Unhandled error occurred after the response was already sent.",
//           err,
//         );
//         return;
//       }
//       ErrorFormatter.handle(normalizeError(err), req, res);
//     }
//   }

//   // ============================================================
//   // Internal helper
//   // ============================================================

//   private register_route(
//     method: string,
//     path: string,
//     handlers: IHandler[],
//   ): void {
//     this.registerWithMeta(method, path, handlers);
//   }
// }

const MIDDLEWARE_METHOD = "USE";
const WILDCARD_METHOD = "ALL";
const QUERY_METHOD = "QUERY";

export class Router implements IRouter {
	protected routes: IRoute[] = [];

	// ============================================================
	// Verb registration
	// ============================================================

	public get(path: string, ...handlers: IHandler[]): void {
		this.register_route("GET", path, handlers);
	}
	public post(path: string, ...handlers: IHandler[]): void {
		this.register_route("POST", path, handlers);
	}
	public put(path: string, ...handlers: IHandler[]): void {
		this.register_route("PUT", path, handlers);
	}
	public patch(path: string, ...handlers: IHandler[]): void {
		this.register_route("PATCH", path, handlers);
	}
	public delete(path: string, ...handlers: IHandler[]): void {
		this.register_route("DELETE", path, handlers);
	}
	public options(path: string, ...handlers: IHandler[]): void {
		this.register_route("OPTIONS", path, handlers);
	}
	public head(path: string, ...handlers: IHandler[]): void {
		this.register_route("HEAD", path, handlers);
	}
	public trace(path: string, ...handlers: IHandler[]): void {
		this.register_route("TRACE", path, handlers);
	}
	public connect(path: string, ...handlers: IHandler[]): void {
		this.register_route("CONNECT", path, handlers);
	}
	public query(path: string, ...handlers: IHandler[]): void {
		this.register_route(QUERY_METHOD, path, handlers);
	}
	public all(path: string, ...handlers: IHandler[]): void {
		this.register_route(WILDCARD_METHOD, path, handlers);
	}

	public use(pathOrHandler: string | IHandler, ...handlers: IHandler[]): void {
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

	public getRoutes(): IRoute[] {
		return this.routes;
	}

	public clearRoutes(): void {
		this.routes = [];
	}

	public registerWithMeta(
		method: string,
		path: string,
		handlers: IHandler[],
		meta?: IRouteMeta,
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

		const route: IRoute = {
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

	public match(
		method: string = "GET",
		rawUrl: string = "/",
	): IMatchResult | undefined {
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
	 * Runs matching + the full middleware/handler pipeline for one
	 * request. Unlike `handleRequest`, this does NOT catch/format errors
	 * itself — it lets them propagate. Intended for embedding inside a
	 * larger error-handling boundary (e.g. SubatomServer's user-defined
	 * error-middleware pipeline). Use `handleRequest` if you're driving
	 * the Router directly with no outer error handling of your own.
	 */
	public async dispatch(
		req: IRequest,
		res: IResponse,
		globalMiddlewares: IHandler[] = [],
	): Promise<void> {
		const pathName = this.extractPathname(req.url || "/");
		const method = req.method || "GET";

		const { handlers: useMiddlewares, params: useParams } =
			this.collectUseMiddlewares(pathName);

		const matchResult = this.match(method, req.url || "/");

		if (!matchResult) {
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
	}

	/**
	 * Convenience wrapper around `dispatch` for using the Router
	 * standalone: catches any error and formats a response via
	 * ErrorFormatter directly.
	 */
	public async handleRequest(
		req: IRequest,
		res: IResponse,
		globalMiddlewares: IHandler[] = [],
	): Promise<void> {
		try {
			await this.dispatch(req, res, globalMiddlewares);
		} catch (err: unknown) {
			// If a handler already wrote and ended the response before
			// throwing, we can't safely send another one.
			if (res.writableEnded) {
				console.error(
					"[Subatom Error]: Unhandled error occurred after the response was already sent.",
					err,
				);
				return;
			}
			ErrorFormatter.handle(normalizeError(err), req, res);
		}
	}

	// ============================================================
	// Internal: pipeline execution
	// ============================================================

	private async runPipeline(
		handlers: IHandler[],
		req: IRequest,
		res: IResponse,
	): Promise<void> {
		const pipeline = new Next(handlers, req, res);
		await pipeline.run();
	}

	// ============================================================
	// Internal: middleware collection
	// ============================================================

	private collectUseMiddlewares(pathName: string): {
		handlers: IHandler[];
		params: Record<string, string>;
	} {
		const handlers: IHandler[] = [];
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

	private extractPathname(rawUrl: string): string {
		const queryIndex = rawUrl.indexOf("?");
		const pathPart = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);
		return pathPart || "/";
	}

	private extractQuery(rawUrl: string): Record<string, string> {
		const queryIndex = rawUrl.indexOf("?");
		const queryString = queryIndex === -1 ? "" : rawUrl.slice(queryIndex + 1);
		const searchParams = new URLSearchParams(queryString);
		return Object.fromEntries(searchParams.entries());
	}

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

	private register_route(
		method: string,
		path: string,
		handlers: IHandler[],
	): void {
		this.registerWithMeta(method, path, handlers);
	}
}
