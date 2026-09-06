import { afterEach, describe, expect, it, vi } from "vitest";
import { SubAtomDocs } from "../../openapi/registerDocs.js";
import type { IRoute } from "../../packages/core/router/types/router.types.js";
import type { ISubatom } from "../../packages/core/subatom/types/subatom.types.js";

interface MockResponse {
	json: ReturnType<typeof vi.fn>;
	status: ReturnType<typeof vi.fn>;
	setHeader: ReturnType<typeof vi.fn>;
	send: ReturnType<typeof vi.fn>;
}

interface MockApp {
	get: ReturnType<typeof vi.fn>;
	getRoutes?: () => IRoute[];
	router?: {
		getRoutes?: () => IRoute[];
	};
}

function createMockResponse(): MockResponse {
	const res: MockResponse = {
		json: vi.fn(),
		status: vi.fn().mockReturnThis(),
		setHeader: vi.fn(),
		send: vi.fn(),
	};
	return res;
}

describe("registerDocs", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should register both /openapi.json and documentation UI routes on the app", () => {
		const app: MockApp = {
			get: vi.fn(),
			getRoutes: () => [],
		};

		SubAtomDocs(app as unknown as ISubatom);

		expect(app.get).toHaveBeenCalledTimes(2);
		expect(app.get).toHaveBeenCalledWith("/openapi.json", expect.any(Function));
		expect(app.get).toHaveBeenCalledWith("/docs", expect.any(Function));
	});

	it("should register custom docs path when provided in options", () => {
		const app: MockApp = {
			get: vi.fn(),
			getRoutes: () => [],
		};

		SubAtomDocs(app as unknown as ISubatom, { path: "/custom-api-docs" });

		expect(app.get).toHaveBeenCalledWith("/custom-api-docs", expect.any(Function));
	});

	it("should serve HTML with content-type text/html on docs endpoint", () => {
		const routeHandlers: Record<string, Function> = {};
		const app: MockApp = {
			get: vi.fn((path: string, handler: Function) => {
				routeHandlers[path] = handler;
			}),
			getRoutes: () => [],
		};

		SubAtomDocs(app as unknown as ISubatom);

		const res = createMockResponse();
		routeHandlers["/docs"]({}, res);

		expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/html");
		expect(res.send).toHaveBeenCalledWith(expect.stringContaining("<!doctype html>"));
	});

	it("should extract routes from app.getRoutes and serve generated OpenAPI spec", () => {
		const routeHandlers: Record<string, Function> = {};
		const sampleRoutes: IRoute[] = [
			{
				method: "GET",
				path: "/health",
				handlers: [],
			} as unknown as IRoute,
		];

		const app: MockApp = {
			get: vi.fn((path: string, handler: Function) => {
				routeHandlers[path] = handler;
			}),
			getRoutes: () => sampleRoutes,
		};

		SubAtomDocs(app as unknown as ISubatom);

		const res = createMockResponse();
		routeHandlers["/openapi.json"]({}, res);

		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				openapi: "3.1.0",
				paths: expect.objectContaining({
					"/health": expect.anything(),
				}),
			}),
		);
	});

	it("should extract routes from app.router.getRoutes if app.getRoutes is not defined", () => {
		const routeHandlers: Record<string, Function> = {};
		const sampleRoutes: IRoute[] = [
			{
				method: "GET",
				path: "/v1/test",
				handlers: [],
			} as unknown as IRoute,
		];

		const app: MockApp = {
			get: vi.fn((path: string, handler: Function) => {
				routeHandlers[path] = handler;
			}),
			router: {
				getRoutes: () => sampleRoutes,
			},
		};

		SubAtomDocs(app as unknown as ISubatom);

		const res = createMockResponse();
		routeHandlers["/openapi.json"]({}, res);

		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				paths: expect.objectContaining({
					"/v1/test": expect.anything(),
				}),
			}),
		);
	});

	it("should return empty paths if neither app nor app.router implements getRoutes", () => {
		const routeHandlers: Record<string, Function> = {};
		const app: MockApp = {
			get: vi.fn((path: string, handler: Function) => {
				routeHandlers[path] = handler;
			}),
		};

		SubAtomDocs(app as unknown as ISubatom);

		const res = createMockResponse();
		routeHandlers["/openapi.json"]({}, res);

		expect(res.json).toHaveBeenCalledWith(
			expect.objectContaining({
				paths: {},
			}),
		);
	});

	it("should cache generated specification when caching is enabled and route count remains identical", () => {
		const routeHandlers: Record<string, Function> = {};
		const routes: IRoute[] = [
			{ method: "GET", path: "/ping", handlers: [] } as unknown as IRoute,
		];
		const getRoutesSpy = vi.fn().mockReturnValue(routes);

		const app: MockApp = {
			get: vi.fn((path: string, handler: Function) => {
				routeHandlers[path] = handler;
			}),
			getRoutes: getRoutesSpy,
		};

		SubAtomDocs(app as unknown as ISubatom, { cache: true });

		const res1 = createMockResponse();
		const res2 = createMockResponse();

		routeHandlers["/openapi.json"]({}, res1);
		routeHandlers["/openapi.json"]({}, res2);

		const firstCallSpec = res1.json.mock.calls[0][0];
		const secondCallSpec = res2.json.mock.calls[0][0];

		expect(firstCallSpec).toBe(secondCallSpec);
	});

	it("should regenerate specification if cache is false", () => {
		const routeHandlers: Record<string, Function> = {};
		const routes: IRoute[] = [
			{ method: "GET", path: "/ping", handlers: [] } as unknown as IRoute,
		];

		const app: MockApp = {
			get: vi.fn((path: string, handler: Function) => {
				routeHandlers[path] = handler;
			}),
			getRoutes: () => [...routes],
		};

		SubAtomDocs(app as unknown as ISubatom, { cache: false });

		const res1 = createMockResponse();
		const res2 = createMockResponse();

		routeHandlers["/openapi.json"]({}, res1);
		routeHandlers["/openapi.json"]({}, res2);

		const firstCallSpec = res1.json.mock.calls[0][0];
		const secondCallSpec = res2.json.mock.calls[0][0];

		expect(firstCallSpec).not.toBe(secondCallSpec);
		expect(firstCallSpec).toEqual(secondCallSpec);
	});

	it("should catch errors during spec generation, log error, and return 500 status", () => {
		const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const routeHandlers: Record<string, Function> = {};

		const app: MockApp = {
			get: vi.fn((path: string, handler: Function) => {
				routeHandlers[path] = handler;
			}),
			getRoutes: () => {
				throw new Error("Router failure");
			},
		};

		SubAtomDocs(app as unknown as ISubatom);

		const res = createMockResponse();
		routeHandlers["/openapi.json"]({}, res);

		expect(errSpy).toHaveBeenCalledWith(
			expect.stringContaining("[subatom:docs] Failed to generate OpenAPI spec:"),
			expect.any(Error),
		);
		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({
			error: "Failed to generate OpenAPI specification.",
			message: "Router failure",
		});
	});
});