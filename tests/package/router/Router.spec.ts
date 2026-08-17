import { describe, expect, it, vi } from "vitest";
import {
	MethodNotAllowedError,
	NotFoundError,
} from "../../../package/core/http/errors/Error.js";
import { Router } from "../../../package/core/router/Router.js";
import type {
	IInterceptor,
	ISerializer,
	ITransformer,
} from "../../../package/types/framework/pipeline/IPipeline.js";
import type { IHandler } from "../../../package/types/framework/router/IRouter.js";
import type { IRequest } from "../../../package/types/http/IRequest.js";
import type { IResponse } from "../../../package/types/http/IResponse.js";

describe("Enterprise Suite: Router Core Engine", () => {
	const createMocks = (method: string, url: string) => {
		const req = {
			method,
			url,
			path: url.split("?")[0],
			params: {},
			query: {},
		} as unknown as IRequest;

		const res = {
			writableEnded: false,
			status: vi.fn().mockReturnThis(),
			json: vi.fn().mockReturnThis(),
			send: vi.fn().mockReturnThis(),
		} as unknown as IResponse;

		return { req, res };
	};

	it("should register and match all standard HTTP methods", () => {
		const router = new Router();
		const h: IHandler = () => {};

		router.get("/test", h);
		router.post("/test", h);
		router.put("/test", h);
		router.patch("/test", h);
		router.delete("/test", h);
		router.options("/test", h);
		router.head("/test", h);
		router.trace("/test", h);
		router.connect("/test", h);
		router.query("/test", h);
		router.all("/wildcard", h);

		expect(router.match("GET", "/test")).toBeDefined();
		expect(router.match("POST", "/test")).toBeDefined();
		expect(router.match("PUT", "/test")).toBeDefined();
		expect(router.match("PATCH", "/test")).toBeDefined();
		expect(router.match("DELETE", "/test")).toBeDefined();
		expect(router.match("OPTIONS", "/test")).toBeDefined();
		expect(router.match("HEAD", "/test")).toBeDefined();
		expect(router.match("TRACE", "/test")).toBeDefined();
		expect(router.match("CONNECT", "/test")).toBeDefined();
		expect(router.match("QUERY", "/test")).toBeDefined();
		expect(router.match("CUSTOM_VERB", "/wildcard")).toBeDefined();
	});

	it("should enforce unique route names", () => {
		const router = new Router();
		router.get("/users", () => {}, { name: "users.index" });

		expect(() => {
			router.post("/users", () => {}, { name: "users.index" });
		}).toThrow(TypeError);
	});

	it("should properly execute pipeline and populate req.params and req.query on dispatch", async () => {
		const router = new Router();
		let executed = false;

		router.get("/org/:orgId/users/:userId", (req, _res) => {
			executed = true;
			expect(req.params).toEqual({ orgId: "acme", userId: "42" });
			expect(req.query).toEqual({ tab: "activity" });
		});

		const { req, res } = createMocks("GET", "/org/acme/users/42?tab=activity");
		await router.dispatch(req, res);
		expect(executed).toBe(true);
	});

	it("should throw MethodNotAllowedError when path exists but verb does not match", async () => {
		const router = new Router();
		router.post("/submit", () => {});

		const { req, res } = createMocks("GET", "/submit");
		await expect(router.dispatch(req, res)).rejects.toThrow(
			MethodNotAllowedError,
		);
	});

	it("should throw NotFoundError when path does not exist", async () => {
		const router = new Router();
		router.get("/exists", () => {});

		const { req, res } = createMocks("GET", "/does-not-exist");
		await expect(router.dispatch(req, res)).rejects.toThrow(NotFoundError);
	});

	it("should cleanly mount nested sub-routers using use()", async () => {
		const app = new Router();
		const api = new Router();
		const users = new Router();

		users.get("/:id", (req) => {
			expect(req.params.id).toBe("99");
		});

		api.use("/users", users);
		app.use("/api/v1", api);

		const { req, res } = createMocks("GET", "/api/v1/users/99");
		await app.dispatch(req, res);
	});

	it("should generate URLs correctly via urlFor", () => {
		const router = new Router();
		router.get("/posts/:postId/comments/:commentId", () => {}, {
			name: "comments.show",
		});

		const url = router.urlFor(
			"comments.show",
			{ postId: "1", commentId: "20" },
			{ page: 1 },
		);
		expect(url).toBe("/posts/1/comments/20?page=1");

		expect(() => router.urlFor("non.existent")).toThrow(
			'[Subatom] urlFor: no route registered with name "non.existent".',
		);
	});

	it("should manage pipeline modifiers (transformers, interceptors, serializers)", () => {
		const router = new Router();

		const t = { beforeRequest: vi.fn() } as unknown as ITransformer;
		const i = { intercept: vi.fn() } as unknown as IInterceptor;
		const s = { serialize: vi.fn() } as unknown as ISerializer;

		router.transformer(t);
		router.intercept(i);
		router.serializer(s);

		const config = router.getPipelineConfig();
		expect(config.transformers).toContain(t);
		expect(config.interceptors).toContain(i);
		expect(config.serializers).toContain(s);
	});
});
