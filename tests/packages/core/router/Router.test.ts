/// <reference types="node" />
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Router } from "../../../../packages/core/router/Router.js";
import { Request } from "../../../../packages/core/http/request/Request.js";
import { Response } from "../../../../packages/core/http/response/Response.js";
import { ErrorFormatter } from "../../../../packages/errors/ErrorFormatter.js";
import {
	MethodNotAllowedError,
	NotFoundError,
} from "../../../../packages/errors/Errors.js";
import type {
	IHandler,
	IRouteMiddleware,
} from "../../../../packages/core/router/types/router.types.js";
import type {
	ITransformer,
	IInterceptor,
	ISerializer,
} from "../../../../packages/pipelines/pipeline.types.js";

vi.mock("../../../../packages/errors/ErrorFormatter.js", () => ({
	ErrorFormatter: {
		handle: vi.fn(),
	},
}));

vi.mock("../../../../packages/methods/uuid.js", () => ({
	uuid: {
		short: () => "mock-uuid",
	},
}));

function createHttpFixture(
	method = "GET",
	url = "/users",
	headers: Record<string, string> = { host: "localhost:8080" },
): {
	req: Request;
	res: Response;
	rawReq: IncomingMessage;
	rawRes: ServerResponse;
} {
	const rawReq = Object.assign(new EventEmitter(), {
		method,
		url,
		headers,
		socket: { remoteAddress: "127.0.0.1", encrypted: false },
		off: vi.fn(),
	}) as unknown as IncomingMessage;

	const rawRes = Object.assign(new EventEmitter(), {
		headersSent: false,
		writableEnded: false,
		statusCode: 200,
		setHeader: vi.fn(),
		getHeader: vi.fn(),
		removeHeader: vi.fn(),
		write: vi.fn().mockReturnValue(true),
		end: vi.fn(function (this: { writableEnded: boolean }) {
			this.writableEnded = true;
		}),
	}) as unknown as ServerResponse;

	const req = new Request(rawReq);
	const res = new Response(rawRes);

	return { req, res, rawReq, rawRes };
}

const createMockHandler = (): IHandler =>
	vi.fn((_req, _res, next) => {
		if (typeof next === "function") next();
	});

describe("Router", () => {
	let router: Router;
	let req: Request;
	let res: Response;

	beforeEach(() => {
		vi.clearAllMocks();
		router = new Router();
		const fixture = createHttpFixture("GET", "/users");
		req = fixture.req;
		res = fixture.res;
	});

	describe("Verb Registration", () => {
		it("should register and match all standard HTTP methods", () => {
			const handler = createMockHandler();
			router.get("/get", handler);
			router.post("/post", handler);
			router.put("/put", handler);
			router.patch("/patch", handler);
			router.delete("/delete", handler);
			router.options("/options", handler);
			router.head("/head", handler);
			router.trace("/trace", handler);
			router.connect("/connect", handler);
			router.query("/query", handler);

			expect(router.match("GET", "/get")?.route.path).toBe("/get");
			expect(router.match("POST", "/post")?.route.path).toBe("/post");
			expect(router.match("PUT", "/put")?.route.path).toBe("/put");
			expect(router.match("PATCH", "/patch")?.route.path).toBe("/patch");
			expect(router.match("DELETE", "/delete")?.route.path).toBe("/delete");
			expect(router.match("OPTIONS", "/options")?.route.path).toBe("/options");
			expect(router.match("HEAD", "/head")?.route.path).toBe("/head");
			expect(router.match("TRACE", "/trace")?.route.path).toBe("/trace");
			expect(router.match("CONNECT", "/connect")?.route.path).toBe("/connect");
			expect(router.match("QUERY", "/query")?.route.path).toBe("/query");
		});

		it("should register and match ALL wildcard routes for any HTTP method", () => {
			router.all("/wildcard", createMockHandler());
			expect(router.match("GET", "/wildcard")).toBeDefined();
			expect(router.match("POST", "/wildcard")).toBeDefined();
			expect(router.match("DELETE", "/wildcard")).toBeDefined();
		});

		it("should register routes using object options configuration", () => {
			router.get("/profile", {
				name: "user.profile",
				tags: ["user"],
				rateLimit: "100/m",
				controller: () => ({ ok: true }),
			});

			const route = router.findRouteByName("user.profile");
			expect(route).toBeDefined();
			expect(route?.tags).toEqual(["user"]);
			expect(route?.rateLimit).toBe("100/m");
		});

		it("should throw a TypeError if method is invalid or empty", () => {
			expect(() =>
				router.registerWithMeta("", "/path", [createMockHandler()]),
			).toThrow(TypeError);
		});

		it("should throw a TypeError if no handlers are provided or a handler is invalid", () => {
			expect(() => router.registerWithMeta("GET", "/path", [])).toThrow(
				TypeError,
			);
			expect(() =>
				router.registerWithMeta("GET", "/path", [{} as unknown as IHandler]),
			).toThrow(TypeError);
		});

		it("should throw an error on duplicate route names", () => {
			router.get("/first", createMockHandler(), { name: "test-route" });
			expect(() =>
				router.get("/second", createMockHandler(), { name: "test-route" }),
			).toThrow(TypeError);
		});
	});

	describe("Trie Matching & Parameters", () => {
		it("should extract path parameters correctly", () => {
			router.get("/users/:id/orders/:orderId", createMockHandler());
			const matched = router.match("GET", "/users/100/orders/200");
			expect(matched?.params).toEqual({ id: "100", orderId: "200" });
		});

		it("should support optional parameter matching", () => {
			router.get("/archive/:year?", createMockHandler());
			expect(router.match("GET", "/archive/2026")?.params).toEqual({
				year: "2026",
			});
			expect(router.match("GET", "/archive")?.params).toEqual({});
		});

		it("should extract query parameters from URL", () => {
			router.get("/search", createMockHandler());
			const matched = router.match("GET", "/search?term=vitest&page=2");
			expect(matched?.query).toEqual({ term: "vitest", page: "2" });
		});

		it("should prefer static routes, fall back to ALL routes, and reject malformed parameters", () => {
			// Arrange
			router.get("/files/:name", createMockHandler());
			router.get("/files/new", createMockHandler());
			router.all("/fallback", createMockHandler());

			// Act
			const staticMatch = router.match("GET", "/files/new");
			const wildcardMatch = router.match("PATCH", "/fallback");
			const malformedMatch = router.match("GET", "/files/%E0%A4%A");

			// Assert
			expect(staticMatch?.route.path).toBe("/files/new");
			expect(wildcardMatch?.route.method).toBe("ALL");
			expect(malformedMatch).toBeUndefined();
		});

		it("should normalize method casing and preserve trailing parameter segments", () => {
			// Arrange
			router.get("/projects/:projectId/", createMockHandler());

			// Act
			const lowerCaseMethod = router.match("get", "/projects/0/");
			const unmatched = router.match("GET", "/projects/0/history");

			// Assert
			expect(lowerCaseMethod?.params).toEqual({ projectId: "0" });
			expect(unmatched).toBeUndefined();
		});

		it("should reject missing, nameless, and malformed parameters in prefix matching", () => {
			// Arrange
			const internalRouter = router as unknown as {
				matchPath(
					routePath: string,
					incomingPath: string,
					options?: { prefix?: boolean },
				): Record<string, string> | null;
			};

			// Act
			const missingRequired = internalRouter.matchPath(
				"/projects/:projectId",
				"/projects",
			);
			const missingName = internalRouter.matchPath(
				"/projects/:",
				"/projects/0",
			);
			const malformedEncoding = internalRouter.matchPath(
				"/projects/:projectId",
				"/projects/%E0%A4%A",
			);
			const matchedParameter = internalRouter.matchPath(
				"/projects/:projectId",
				"/projects/0",
			);

			// Assert
			expect(missingRequired).toBeNull();
			expect(missingName).toBeNull();
			expect(malformedEncoding).toBeNull();
			expect(matchedParameter).toEqual({ projectId: "0" });
		});
	});

	describe("Groups", () => {
		it("should register grouped routes via callback syntax with prefixes and metadata", () => {
			router.group("/api/v1", {
				tags: ["v1"],
				rateLimit: "60/m",
				name: "v1",
				routes: (child) => {
					child.get("/users", createMockHandler(), { name: "users" });
				},
			});

			const route = router.findRouteByName("v1.users");
			expect(route).toBeDefined();
			expect(route?.path).toBe("/api/v1/users");
			expect(route?.tags).toEqual(["v1"]);
			expect(route?.rateLimit).toBe("60/m");
		});

		it("should register grouped routes via chaining proxy syntax", () => {
			const group = router.group("/dashboard");
			group.get("/stats", createMockHandler());

			expect(router.match("GET", "/dashboard/stats")).toBeDefined();
		});

		it("should inherit group middleware, tags, rate limit, and name prefixes", async () => {
			// Arrange
			const groupMiddleware: IRouteMiddleware = vi.fn((_req, _res, next) =>
				next(),
			);
			const endpoint = createMockHandler();
			router.group("/api", {
				name: "api",
				tags: ["api"],
				rateLimit: "10/m",
				middleware: [groupMiddleware],
				routes: (child) =>
					child.get("/items/:id", endpoint, { name: "show", tags: ["items"] }),
			});
			const fixture = createHttpFixture("GET", "/api/items/0");

			// Act
			await router.dispatch(fixture.req, fixture.res);
			const route = router.findRouteByName("api.show");

			// Assert
			expect(groupMiddleware).toHaveBeenCalledOnce();
			expect(endpoint).toHaveBeenCalledOnce();
			expect(route?.tags).toEqual(["api", "items"]);
			expect(route?.rateLimit).toBe("10/m");
			expect(fixture.req.params).toEqual({ id: "0" });
		});
	});

	describe("Sub-router Mounting (use)", () => {
		it("should mount sub-routers with path prefix", () => {
			const sub = new Router();
			sub.get("/posts", createMockHandler());
			router.use("/admin", sub);

			expect(router.match("GET", "/admin/posts")).toBeDefined();
		});

		it("should register path-based and global USE middleware", async () => {
			const mw: IRouteMiddleware = vi.fn((_req, _res, next) => {
				next();
			});

			const endpoint: IHandler = vi.fn((_req, res) => {
				res.end();
			});

			router.use("/users", mw);
			router.get("/users/settings", endpoint);

			const fixture = createHttpFixture("GET", "/users/settings");
			await router.dispatch(fixture.req, fixture.res);

			expect(mw).toHaveBeenCalled();
			expect(endpoint).toHaveBeenCalled();
		});

		it("should throw if use receives an invalid argument", () => {
			expect(() => router.use("/test", null as unknown as Router)).toThrow(
				TypeError,
			);
			expect(() => router.use(123 as unknown as string)).toThrow(TypeError);
		});

		it("should run global and parameterized USE middleware only for matching prefixes", async () => {
			// Arrange
			const globalMiddleware: IRouteMiddleware = vi.fn((_req, _res, next) =>
				next(),
			);
			const parameterizedMiddleware: IRouteMiddleware = vi.fn(
				(_req, _res, next) => next(),
			);
			const endpoint = createMockHandler();
			router.use(globalMiddleware);
			router.use("/teams/:teamId", parameterizedMiddleware);
			router.get("/teams/:teamId/members", endpoint);
			const fixture = createHttpFixture("GET", "/teams/0/members");

			// Act
			await router.dispatch(fixture.req, fixture.res);

			// Assert
			expect(globalMiddleware).toHaveBeenCalledOnce();
			expect(parameterizedMiddleware).toHaveBeenCalledOnce();
			expect(endpoint).toHaveBeenCalledOnce();
			expect(fixture.req.params).toEqual({ teamId: "0" });
		});
	});

	describe("Dispatch & Error Handling", () => {
		it("should dispatch request and execute handlers", async () => {
			const handler: IHandler = vi.fn((_req, res) => {
				res.end();
			});
			router.get("/test", handler);

			const fixture = createHttpFixture("GET", "/test");
			await router.dispatch(fixture.req, fixture.res);
			expect(handler).toHaveBeenCalled();
		});

		it("should throw MethodNotAllowedError if route exists under another method", async () => {
			router.post("/items", createMockHandler());
			const fixture = createHttpFixture("GET", "/items");

			await expect(router.dispatch(fixture.req, fixture.res)).rejects.toThrow(
				MethodNotAllowedError,
			);
		});

		it("should throw NotFoundError if route is not registered", async () => {
			const fixture = createHttpFixture("GET", "/unregistered");

			await expect(router.dispatch(fixture.req, fixture.res)).rejects.toThrow(
				NotFoundError,
			);
		});

		it("should format and handle error via handleRequest", async () => {
			const errorHandler: IHandler = () => {
				throw new Error("Fatal boom");
			};
			router.get("/error", errorHandler);

			const fixture = createHttpFixture("GET", "/error");
			await router.handleRequest(fixture.req, fixture.res);

			expect(ErrorFormatter.handle).toHaveBeenCalled();
		});

		it("should not format error if response writable has already ended", async () => {
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});
			const endedHandler: IHandler = (_req, response) => {
				response.end();
				throw new Error("After end");
			};

			router.get("/ended", endedHandler);
			const fixture = createHttpFixture("GET", "/ended");

			await router.handleRequest(fixture.req, fixture.res);
			expect(ErrorFormatter.handle).not.toHaveBeenCalled();
			expect(consoleSpy).toHaveBeenCalled();
			consoleSpy.mockRestore();
		});

		it("should dispatch defaults when a request omits its method and URL", async () => {
			// Arrange
			const handler = createMockHandler();
			router.get("/", handler);
			const fixture = createHttpFixture();
			fixture.req.method = "";
			fixture.req.url = "";

			// Act
			await router.dispatch(fixture.req, fixture.res);

			// Assert
			expect(handler).toHaveBeenCalledOnce();
		});
	});

	describe("Pipelines & urlFor", () => {
		it("should register modifiers and attach them to new and existing routes", () => {
			const dummyTransformer = {
				beforeRequest: vi.fn(),
			} as unknown as ITransformer;
			const dummyInterceptor = {
				intercept: vi.fn(),
			} as unknown as IInterceptor;
			const dummySerializer = {
				serialize: vi.fn(),
			} as unknown as ISerializer;

			router.get("/pre", createMockHandler());
			router.transformer(dummyTransformer);
			router.intercept(dummyInterceptor);
			router.serializer(dummySerializer);
			router.get("/post", createMockHandler());

			const pre = router.match("GET", "/pre")?.route.routerPipeline;
			const post = router.match("GET", "/post")?.route.routerPipeline;

			expect(pre?.transformers).toContain(dummyTransformer);
			expect(post?.interceptors).toContain(dummyInterceptor);
			expect(post?.serializers).toContain(dummySerializer);
		});

		it("should reverse lookup and build URLs with urlFor", () => {
			router.get("/posts/:id", createMockHandler(), { name: "posts.show" });
			const url = router.urlFor("posts.show", { id: "42" }, { ref: "feed" });
			expect(url).toBe("/posts/42?ref=feed");
		});

		it("should throw in urlFor when route name is not found", () => {
			expect(() => router.urlFor("unknown.route")).toThrow(
				'[Subatom] urlFor: no route registered with name "unknown.route".',
			);
		});

		it("should expose an immutable route snapshot and clear both routes and indexes", () => {
			// Arrange
			router.get("/snapshot", createMockHandler(), { name: "snapshot" });

			// Act
			const routes = router.getRoutes();
			router.clearRoutes();

			// Assert
			expect(Object.isFrozen(routes)).toBe(true);
			expect(Object.isFrozen(routes[0])).toBe(true);
			expect(router.hasRoute("snapshot")).toBe(false);
			expect(router.match("GET", "/snapshot")).toBeUndefined();
		});
	});
});
