// subatom/package/core/router/Router.ts

import type {
	IInterceptor,
	ISerializer,
	ITransformer,
} from "../../types/framework/pipeline/IPipeline.js";
import type {
	IResourceController,
	IResourceOptions,
} from "../../types/framework/router/IResourceRouter.js";
import type {
	IHandler,
	IMatchResult,
	IRoute,
	IRouteMeta,
	IRouteOptions,
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
import type { IRequestPipelineConfig } from "../pipeline/modifier/RequestPipeline.js";
import {
	registerInterceptor,
	registerSerializer,
	registerTransformer,
} from "../pipeline/modifier/services/pipelineRegistrar.service.js";
import { Next } from "../pipeline/next-pipeline/Next.js";
import { buildRequestValidator } from "../validation/RequestValidator.js";
import { buildUrl } from "./helpers/buildUrl.js";
import isRouterInstance from "./helpers/isRouterInstance.js";
import { parseRouteArgs } from "./helpers/parseRouteArgs.js";
import { buildResourceRoutes } from "./helpers/resourceRouteBuilder.js";

const MIDDLEWARE_METHOD = "USE";
const WILDCARD_METHOD = "ALL";
const QUERY_METHOD = "QUERY";

export class Router implements IRouter {
	protected routes: IRoute[] = [];

	private readonly transformers: ITransformer[] = [];
	private readonly interceptors: IInterceptor[] = [];
	private readonly serializers: ISerializer[] = [];

	// ============================================================
	// Router-level pipeline registration
	// ============================================================

	public transformer(transformer: ITransformer): void {
		registerTransformer(this.transformers, transformer);
	}

	public intercept(interceptor: IInterceptor): void {
		registerInterceptor(this.interceptors, interceptor);
	}

	public serializer(serializer: ISerializer): void {
		registerSerializer(this.serializers, serializer);
	}

	public getPipelineConfig(): IRequestPipelineConfig {
		return {
			transformers: this.transformers,
			interceptors: this.interceptors,
			serializers: this.serializers,
		};
	}

	// ============================================================
	// Verb registration
	// ============================================================

	public get(path: string, ...args: Array<IHandler | IRouteOptions>): void {
		const { handlers, options } = parseRouteArgs(args);
		this.register_route("GET", path, handlers, options);
	}
	public post(path: string, ...args: Array<IHandler | IRouteOptions>): void {
		const { handlers, options } = parseRouteArgs(args);
		this.register_route("POST", path, handlers, options);
	}
	public put(path: string, ...args: Array<IHandler | IRouteOptions>): void {
		const { handlers, options } = parseRouteArgs(args);
		this.register_route("PUT", path, handlers, options);
	}
	public patch(path: string, ...args: Array<IHandler | IRouteOptions>): void {
		const { handlers, options } = parseRouteArgs(args);
		this.register_route("PATCH", path, handlers, options);
	}
	public delete(path: string, ...args: Array<IHandler | IRouteOptions>): void {
		const { handlers, options } = parseRouteArgs(args);
		this.register_route("DELETE", path, handlers, options);
	}

	public options(path: string, ...args: Array<IHandler | IRouteOptions>): void {
		const { handlers, options } = parseRouteArgs(args);
		this.register_route("OPTIONS", path, handlers, options);
	}

	public head(path: string, ...args: Array<IHandler | IRouteOptions>): void {
		const { handlers, options } = parseRouteArgs(args);
		this.register_route("HEAD", path, handlers, options);
	}

	public trace(path: string, ...args: Array<IHandler | IRouteOptions>): void {
		const { handlers, options } = parseRouteArgs(args);
		this.register_route("TRACE", path, handlers, options);
	}

	public connect(path: string, ...args: Array<IHandler | IRouteOptions>): void {
		const { handlers, options } = parseRouteArgs(args);
		this.register_route("CONNECT", path, handlers, options);
	}

	public query(path: string, ...args: Array<IHandler | IRouteOptions>): void {
		const { handlers, options } = parseRouteArgs(args);
		this.register_route(QUERY_METHOD, path, handlers, options);
	}

	public all(path: string, ...args: Array<IHandler | IRouteOptions>): void {
		const { handlers, options } = parseRouteArgs(args);
		this.register_route(WILDCARD_METHOD, path, handlers, options);
	}

	// ============================================================
	// Resource routing
	// ============================================================

	/**
	 * Registers a full CRUD resource in one call:
	 *
	 *   router.resource("/users", {
	 *     index: getUsers,
	 *     show: getUser,
	 *     create: createUser,
	 *     update: updateUser,
	 *     destroy: deleteUser,
	 *   });
	 *
	 * Generates:
	 *   GET    /users
	 *   POST   /users
	 *   GET    /users/:id
	 *   PUT    /users/:id
	 *   PATCH  /users/:id   (alias of PUT, same handlers)
	 *   DELETE /users/:id
	 *
	 * Only the actions actually implemented on `controller` are registered,
	 * so a read-only resource (just `index` + `show`) works with no extra
	 * config. Use `options.only` / `options.except` when you want to be
	 * explicit and fail loudly if an expected action is missing.
	 *
	 * Each action may be a single handler or an array of handlers, so you
	 * can attach per-action middleware:
	 *
	 *   router.resource("/users", {
	 *     index: getUsers,
	 *     destroy: [requireAdmin, deleteUser],
	 *   });
	 *
	 * Route names follow `<namePrefix>.<action>` (e.g. "users.show") and
	 * work with `urlFor` out of the box.
	 *
	 * Nested resources: mount a child router under the member path rather
	 * than special-casing nesting here — it composes with the existing
	 * `use()` sub-router mounting instead of duplicating it:
	 *
	 *   const postRouter = new Router();
	 *   postRouter.resource("/", postController, { namePrefix: "posts" });
	 *   userRouter.use("/:userId/posts", postRouter);
	 */
	public resource(
		basePath: string,
		controller: IResourceController,
		options: IResourceOptions = {},
	): void {
		const routeDefs = buildResourceRoutes(basePath, controller, options);
		for (const def of routeDefs) {
			this.registerWithMeta(def.method, def.path, def.handlers, def.meta);
		}
	}

	// public use(pathOrHandler: string | IHandler, ...handlers: IHandler[]): void {
	//   if (typeof pathOrHandler === "string") {
	//     this.register_route(MIDDLEWARE_METHOD, pathOrHandler, handlers);
	//   } else if (typeof pathOrHandler === "function") {
	//     this.register_route(MIDDLEWARE_METHOD, "/", [pathOrHandler, ...handlers]);
	//   } else {
	//     throw new TypeError(
	//       "[Subatom] Router.use: first argument must be a string path or a handler function.",
	//     );
	//   }
	// }

	public use(
		pathOrHandler: string | IHandler | Router,
		...handlers: Array<IHandler | Router>
	): void {
		if (typeof pathOrHandler === "string") {
			const path = pathOrHandler;

			for (const h of handlers) {
				if (isRouterInstance(h)) {
					this.mountSubRouter(path, h);
				} else if (typeof h === "function") {
					this.register_route(MIDDLEWARE_METHOD, path, [h]);
				} else {
					throw new TypeError(
						"[Subatom] Router.use: expected a handler function or a Router instance.",
					);
				}
			}
		} else if (typeof pathOrHandler === "function") {
			this.register_route(MIDDLEWARE_METHOD, "/", [
				pathOrHandler,
				...(handlers.filter((h) => typeof h === "function") as IHandler[]),
			]);
		} else if (isRouterInstance(pathOrHandler)) {
			this.mountSubRouter("/", pathOrHandler);
		} else {
			throw new TypeError(
				"[Subatom] Router.use: first argument must be a string path, a handler function, or a Router instance.",
			);
		}
	}

	/**
	 * Flattens a sub-router's route table into this router, prefixing every
	 * route path with the mount path. Runs eagerly at .use()-time, so any
	 * sub-routers already merged into `subRouter` come along for free —
	 * that's why postRouter.use("/:postId/comments", commentRouter) must be
	 * called before userRouter.use("/:userId/posts", postRouter).
	 */
	private mountSubRouter(mountPath: string, subRouter: Router): void {
		const cleanMount = ("/" + mountPath)
			.replace(/\/+/g, "/")
			.replace(/\/$/, "");

		for (const route of subRouter.getRoutes()) {
			const suffix = route.path === "/" ? "" : route.path;
			const combinedPath = (cleanMount + suffix).replace(/\/+/g, "/") || "/";

			this.routes.push({
				...route,
				path: combinedPath,
			});
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

	// ============================================================
	// registerWithMeta — now accepts + validates `name`
	// ============================================================
	// Add this import at the top of Router.ts:

	// Inside Router class, replace `registerWithMeta`:

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

		if (meta?.name) {
			const existing = this.findRouteByName(meta.name);
			if (existing) {
				throw new TypeError(
					`[Subatom] Route name "${meta.name}" is already registered ` +
						`(${existing.method} ${existing.path}). Route names must be unique within a Router.`,
				);
			}
		}

		const cleanPath = ("/" + (path || "/")).replace(/\/+/g, "/");

		// VALIDATION INJECTION LOGIC
		const finalHandlers = [...handlers];

		if (meta?.schema) {
			const validatorMw = buildRequestValidator(meta.schema);
			if (finalHandlers.length > 0) {
				// Pop the controller, insert validator, then re-insert controller
				// This ensures validation happens AFTER file/body parsing middlewares
				const controller = finalHandlers.pop()!;
				finalHandlers.push(validatorMw, controller);
			} else {
				finalHandlers.push(validatorMw);
			}
		}

		const route: IRoute = {
			method: method.toUpperCase(),
			path: cleanPath,
			handlers: finalHandlers,
			routerPipeline: this.getPipelineConfig(),
		};

		if (meta?.tags && meta.tags.length > 0) {
			route.tags = meta.tags;
		}

		if (meta?.rateLimit) {
			route.rateLimit = meta.rateLimit;
		}

		if (meta?.name) {
			route.name = meta.name;
		}

		if (meta?.schema) {
			route.schema = meta.schema;
		}

		this.routes.push(route);
	}

	/**
	 * Finds a route by its registered name. Scans the live route table
	 * on every call rather than maintaining a cached index, since routes
	 * can be appended directly (e.g. by mergeSubRouter) without going
	 * through registerWithMeta — a cache would risk going stale.
	 */
	public findRouteByName(name: string): IRoute | undefined {
		return this.routes.find((route) => route.name === name);
	}

	/** Whether a route with the given name is registered. */
	public hasRoute(name: string): boolean {
		return this.findRouteByName(name) !== undefined;
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

		req.params = { ...useParams, ...matchResult.params };
		req.query = matchResult.query;

		const pipeline = [
			...globalMiddlewares,
			...useMiddlewares,
			...matchResult.route.handlers,
		];

		await this.runPipeline(pipeline, req, res);
	}

	public async handleRequest(
		req: IRequest,
		res: IResponse,
		globalMiddlewares: IHandler[] = [],
	): Promise<void> {
		try {
			await this.dispatch(req, res, globalMiddlewares);
		} catch (err: unknown) {
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

	private async runPipeline(
		handlers: IHandler[],
		req: IRequest,
		res: IResponse,
	): Promise<void> {
		const pipeline = new Next(handlers, req, res);
		await pipeline.run();
	}

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

	/**
	 * Generates a concrete URL path for a named route.
	 *
	 *   router.get("/users/:id", getUser, { name: "users.get" });
	 *   router.urlFor("users.get", { id: 42 });          // → "/users/42"
	 *   router.urlFor("users.list", {}, { page: 2 });    // → "/users?page=2"
	 */
	public urlFor(
		name: string,
		params: Record<string, string | number> = {},
		query?: Record<string, string | number | boolean>,
	): string {
		const route = this.findRouteByName(name);
		if (!route) {
			throw new Error(
				`[Subatom] urlFor: no route registered with name "${name}".`,
			);
		}
		return buildUrl(route.path, params, query);
	}

	// ...rest of the class (match, dispatch, matchPath, etc.) unchanged...

	private register_route(
		method: string,
		path: string,
		handlers: IHandler[],
		options?: IRouteOptions,
	): void {
		this.registerWithMeta(method, path, handlers, options);
	}
}
