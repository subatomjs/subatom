import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MiddlewareHandler } from "../../../../../packages/pipelines/pipeline.types.js";
import type {
	IHandler,
	IRouteOptions,
	IRouteSchema,
} from "../../../../../packages/core/router/types/router.types.js";
import type { IGroupContext } from "../../../../../packages/core/server/types/subatom.server.types.js";
import { Subatom } from "../../../../../packages/core/subatom/Subatom.js";
import { RouteGroupBuilder } from "../../../../../packages/core/subatom/subordinate/RouteGroupBuilder.js";
import { buildGroupContext } from "../../../../../packages/core/subatom/subordinate/services/contextBuilder.service.js";
import { collectMiddlewares } from "../../../../../packages/core/subatom/subordinate/services/middlewareValidator.service.js";
import { appendPrefix } from "../../../../../packages/core/subatom/subordinate/services/pathComposer.service.js";
import { configureRateLimit } from "../../../../../packages/core/subatom/subordinate/services/rateLimitConfig.service.js";
import { registerGroupRoute } from "../../../../../packages/core/subatom/subordinate/services/routeRegistrar.service.js";
import { collectTags } from "../../../../../packages/core/subatom/subordinate/services/tagValidator.service.js";

vi.mock("../../../../../packages/core/subatom/config/env/env.js", () => ({
	configEnv: vi.fn(),
	env: { isProd: false },
}));

vi.mock("../../../../../packages/core/subatom/services/processBoundary.service.js", () => ({
	registerProcessBoundary: vi.fn(() => vi.fn()),
}));

describe("Subordinate: Services", () => {
	describe("pathComposer.service (appendPrefix)", () => {
		it("should compose prefixes correctly", () => {
			expect(appendPrefix("/api", "v1")).toBe("/api/v1");
			expect(appendPrefix("/api/v1", "/users")).toBe("/api/v1/users");
		});

		it("should throw TypeError when segment is not a string", () => {
			expect(() => appendPrefix("/api", 123 as unknown as string)).toThrow(TypeError);
			expect(() => appendPrefix("/api", null as unknown as string)).toThrow(TypeError);
		});
	});

	describe("tagValidator.service (collectTags)", () => {
		it("should collect single and nested string tags while trimming whitespace", () => {
			const target: string[] = [];
			collectTags(target, " auth ", [" admin ", "v1"], "metrics");
			expect(target).toEqual(["auth", "admin", "v1", "metrics"]);
		});

		it("should ignore empty strings, whitespace-only strings, or non-string values", () => {
			const target: string[] = [];
			collectTags(
				target,
				"",
				"   ",
				["", "   ", 42 as unknown as string],
				null as unknown as string,
			);
			expect(target).toEqual([]);
		});
	});

	describe("middlewareValidator.service (collectMiddlewares)", () => {
		it("should collect flat and nested middleware arrays", () => {
			const middlewares: MiddlewareHandler[] = [];
			const m1: MiddlewareHandler = (_req, _res, next) => next();
			const m2: MiddlewareHandler = (_req, _res, next) => next();
			const m3: MiddlewareHandler = (_req, _res, next) => next();

			collectMiddlewares(middlewares, m1, [m2, m3]);
			expect(middlewares).toEqual([m1, m2, m3]);
		});

		it("should throw TypeError if any handler is not a function", () => {
			const middlewares: MiddlewareHandler[] = [];
			expect(() =>
				collectMiddlewares(middlewares, "invalid" as unknown as MiddlewareHandler),
			).toThrow(TypeError);

			expect(() =>
				collectMiddlewares(middlewares, [null as unknown as MiddlewareHandler]),
			).toThrow(TypeError);
		});
	});

	describe("rateLimitConfig.service (configureRateLimit)", () => {
		it("should validate the spec and generate corresponding middleware", () => {
			const result = configureRateLimit("60/min");
			expect(result.spec).toBe("60/min");
			expect(typeof result.middleware).toBe("function");
		});

		it("should propagate errors from invalid specs", () => {
			expect(() => configureRateLimit("invalid-spec")).toThrow(TypeError);
		});
	});

	describe("contextBuilder.service (buildGroupContext)", () => {
		it("should merge parent and own attributes seamlessly", () => {
			const parentMw: MiddlewareHandler = (_req, _res, n) => n();
			const ownMw: MiddlewareHandler = (_req, _res, n) => n();
			const parentLimitMw: MiddlewareHandler = (_req, _res, n) => n();

			const parentContext: IGroupContext = {
				prefix: "/api",
				middlewares: [parentMw],
				tags: ["api"],
				rateLimitSpec: "100/m",
				rateLimitMiddleware: parentLimitMw,
			};

			const context = buildGroupContext(
				parentContext,
				"/v1",
				[ownMw],
				["v1"],
				undefined,
				undefined,
			);

			expect(context.prefix).toBe("/api/v1");
			expect(context.middlewares).toEqual([parentMw, ownMw]);
			expect(context.tags).toEqual(["api", "v1"]);
			expect(context.rateLimitSpec).toBe("100/m");
			expect(context.rateLimitMiddleware).toBe(parentLimitMw);
		});

		it("should override rate limit when provided by child", () => {
			const childLimitMw: MiddlewareHandler = (_req, _res, n) => n();
			const context = buildGroupContext(
				undefined,
				"/users",
				[],
				[],
				"10/s",
				childLimitMw,
			);

			expect(context.prefix).toBe("/users");
			expect(context.rateLimitSpec).toBe("10/s");
			expect(context.rateLimitMiddleware).toBe(childLimitMw);
		});
	});

	describe("routeRegistrar.service (registerGroupRoute)", () => {
		it("should compose route attributes and register them on the app", () => {
			const appMock = {
				_registerGroupRoute: vi.fn(),
			} as unknown as Subatom;

			const rateLimitMw: MiddlewareHandler = (_req, _res, n) => n();
			const groupMw: MiddlewareHandler = (_req, _res, n) => n();
			const handler: IHandler = vi.fn();

			const context: IGroupContext = {
				prefix: "/api/v1",
				middlewares: [groupMw],
				tags: ["v1"],
				rateLimitSpec: "50/min",
				rateLimitMiddleware: rateLimitMw,
			};

			registerGroupRoute(appMock, context, "POST", "/users", [handler]);

			expect(appMock._registerGroupRoute).toHaveBeenCalledWith(
				"POST",
				"/api/v1/users",
				[rateLimitMw, groupMw, handler],
				{ tags: ["v1"], rateLimit: "50/min" },
			);
		});

		it("should throw TypeError when path is not a valid non-empty string", () => {
			const appMock = {} as Subatom;
			const context: IGroupContext = {
				prefix: "",
				middlewares: [],
				tags: [],
				rateLimitSpec: undefined,
				rateLimitMiddleware: undefined,
			};
			expect(() =>
				registerGroupRoute(appMock, context, "GET", "", [vi.fn()]),
			).toThrow(TypeError);
			expect(() =>
				registerGroupRoute(appMock, context, "GET", 123 as unknown as string, [
					vi.fn(),
				]),
			).toThrow(TypeError);
		});

		it("should throw TypeError when handlers array is empty or invalid", () => {
			const appMock = {} as Subatom;
			const context: IGroupContext = {
				prefix: "",
				middlewares: [],
				tags: [],
				rateLimitSpec: undefined,
				rateLimitMiddleware: undefined,
			};
			expect(() =>
				registerGroupRoute(appMock, context, "GET", "/test", []),
			).toThrow(TypeError);
			expect(() =>
				registerGroupRoute(
					appMock,
					context,
					"GET",
					"/test",
					null as unknown as IHandler[],
				),
			).toThrow(TypeError);
		});
	});
});

describe("Subordinate: RouteGroupBuilder Class", () => {
	let app: Subatom;

	beforeEach(() => {
		app = new Subatom();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should instantiate with default prefix and throw if prefix is not a string", () => {
		const builder = new RouteGroupBuilder(app);
		expect(builder).toBeInstanceOf(RouteGroupBuilder);

		expect(
			() => new RouteGroupBuilder(app, 999 as unknown as string),
		).toThrow(TypeError);
	});

	it("should support fluent chaining for prefix, middleware, tag, and rateLimit", () => {
		const mw: MiddlewareHandler = (_req, _res, n) => n();
		const builder = new RouteGroupBuilder(app, "/api");

		const ret = builder
			.prefix("v1")
			.middleware(mw)
			.tag("core")
			.rateLimit("30/sec");

		expect(ret).toBe(builder);
	});

	it("should register all HTTP methods (GET, POST, PUT, PATCH, DELETE) with handlers", () => {
		const registerSpy = vi.spyOn(app, "_registerGroupRoute").mockImplementation(() => {});
		const builder = new RouteGroupBuilder(app, "/base");
		const handler: IHandler = vi.fn();

		builder.get("/resource", handler);
		builder.post("/resource", handler);
		builder.put("/resource", handler);
		builder.patch("/resource", handler);
		builder.delete("/resource", handler);

		expect(registerSpy).toHaveBeenCalledTimes(5);
		expect(registerSpy).toHaveBeenNthCalledWith(
			1,
			"GET",
			"/base/resource",
			[handler],
			{},
		);
		expect(registerSpy).toHaveBeenNthCalledWith(
			2,
			"POST",
			"/base/resource",
			[handler],
			{},
		);
		expect(registerSpy).toHaveBeenNthCalledWith(
			3,
			"PUT",
			"/base/resource",
			[handler],
			{},
		);
		expect(registerSpy).toHaveBeenNthCalledWith(
			4,
			"PATCH",
			"/base/resource",
			[handler],
			{},
		);
		expect(registerSpy).toHaveBeenNthCalledWith(
			5,
			"DELETE",
			"/base/resource",
			[handler],
			{},
		);
	});

	it("should accept route options object for HTTP methods", () => {
		const registerSpy = vi.spyOn(app, "_registerGroupRoute").mockImplementation(() => {});
		const builder = new RouteGroupBuilder(app, "/opt");
		const options: IRouteOptions<IRouteSchema> = { controller: vi.fn() };

		builder.get("/res", options);
		expect(registerSpy).toHaveBeenCalledWith("GET", "/opt/res", [options], {});
	});

	describe("group() synchronous execution and nesting", () => {
		it("should push context before invoking callback and pop context afterwards", () => {
			const builder = new RouteGroupBuilder(app, "/parent")
				.tag("parent-tag")
				.middleware((_req, _res, n) => n());

			let nestedRan = false;
			builder.group(() => {
				nestedRan = true;
				const current = app._currentGroupContext();
				expect(current?.prefix).toBe("/parent");
				expect(current?.tags).toEqual(["parent-tag"]);
				expect(current?.middlewares).toHaveLength(1);
			});

			expect(nestedRan).toBe(true);
			expect(app._currentGroupContext()).toBeUndefined();
		});

		it("should support calling .group() without arguments", () => {
			const builder = new RouteGroupBuilder(app, "/noop");
			expect(() => builder.group()).not.toThrow();
			expect(app._currentGroupContext()).toBeUndefined();
		});

		it("should throw TypeError when callback is not a function", () => {
			const builder = new RouteGroupBuilder(app);
			expect(() => builder.group({} as unknown as () => void)).toThrow(TypeError);
		});

		it("should reject asynchronous group callbacks returning Promises", () => {
			const builder = new RouteGroupBuilder(app);
			expect(() => {
				builder.group(async () => {});
			}).toThrow(
				"[Subatom] Route group callbacks must be synchronous. An async callback can interleave with other route registrations and corrupt the group context stack.",
			);
			expect(app._currentGroupContext()).toBeUndefined();
		});

		it("should always pop group context even if the callback throws synchronously", () => {
			const builder = new RouteGroupBuilder(app, "/error");
			expect(() => {
				builder.group(() => {
					throw new Error("Callback explosion");
				});
			}).toThrow("Callback explosion");

			expect(app._currentGroupContext()).toBeUndefined();
		});
	});
});