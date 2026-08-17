import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Subatom } from "../../../package/core/bootstrap/subatom/Subatom.js";
import * as openApiGen from "../../../package/core/docs/openApiGenerator.js";
import { setupApiDocs } from "../../../package/core/docs/registerDocs.js";
import * as swaggerHtml from "../../../package/core/docs/swaggerHtml.js";

describe("registerDocs - setupApiDocs", () => {
	let mockApp: Subatom;
	let registeredRoutes: Map<string, Function>;
	let mockRoutesList: any[];

	beforeEach(() => {
		registeredRoutes = new Map<string, Function>();
		mockRoutesList = [{ method: "GET", path: "/test", handlers: [() => {}] }];

		mockApp = {
			get: vi.fn((path: string, handler: Function) => {
				registeredRoutes.set(path, handler);
			}),
			router: {
				getRoutes: vi.fn(() => mockRoutesList),
			},
		} as unknown as Subatom;
	});

	it("should register default endpoints at /openapi.json and /docs", () => {
		setupApiDocs(mockApp);

		expect(mockApp.get).toHaveBeenCalledWith(
			"/openapi.json",
			expect.any(Function),
		);
		expect(mockApp.get).toHaveBeenCalledWith("/docs", expect.any(Function));
	});

	it("should register custom docs path when provided in options", () => {
		setupApiDocs(mockApp, { path: "/api-documentation" });

		expect(mockApp.get).toHaveBeenCalledWith(
			"/openapi.json",
			expect.any(Function),
		);
		expect(mockApp.get).toHaveBeenCalledWith(
			"/api-documentation",
			expect.any(Function),
		);
	});

	it("should respond with JSON OpenAPI spec on /openapi.json request", () => {
		const specSpy = vi
			.spyOn(openApiGen, "generateOpenApiSpec")
			.mockReturnValue({
				openapi: "3.0.0",
				info: { title: "Custom Title", version: "2.0.0", description: "Desc" },
				paths: {},
			});

		setupApiDocs(mockApp, {
			title: "Custom Title",
			version: "2.0.0",
			description: "Desc",
		});

		const openApiHandler = registeredRoutes.get("/openapi.json")!;
		const mockReq = {};
		const mockRes = {
			json: vi.fn(),
		};

		openApiHandler(mockReq, mockRes);

		expect((mockApp as any).router.getRoutes).toHaveBeenCalledOnce();
		expect(specSpy).toHaveBeenCalledWith(mockRoutesList, {
			title: "Custom Title",
			version: "2.0.0",
			description: "Desc",
		});
		expect(mockRes.json).toHaveBeenCalledWith({
			openapi: "3.0.0",
			info: { title: "Custom Title", version: "2.0.0", description: "Desc" },
			paths: {},
		});

		specSpy.mockRestore();
	});

	it("should pass only defined options to generateOpenApiSpec", () => {
		const specSpy = vi
			.spyOn(openApiGen, "generateOpenApiSpec")
			.mockReturnValue({} as any);

		setupApiDocs(mockApp);

		const openApiHandler = registeredRoutes.get("/openapi.json")!;
		openApiHandler({}, { json: vi.fn() });

		expect(specSpy).toHaveBeenCalledWith(mockRoutesList, {});

		specSpy.mockRestore();
	});

	it("should serve rendered Swagger UI HTML on documentation route", () => {
		const htmlSpy = vi
			.spyOn(swaggerHtml, "renderSwaggerUiHtml")
			.mockReturnValue("<html><body>Swagger</body></html>");

		setupApiDocs(mockApp, { path: "/api/docs" });

		const docsHandler = registeredRoutes.get("/api/docs")!;
		const mockReq = {};
		const mockRes = {
			setHeader: vi.fn(),
			send: vi.fn(),
		};

		docsHandler(mockReq, mockRes);

		expect(htmlSpy).toHaveBeenCalledWith("/openapi.json");
		expect(mockRes.setHeader).toHaveBeenCalledWith("Content-Type", "text/html");
		expect(mockRes.send).toHaveBeenCalledWith(
			"<html><body>Swagger</body></html>",
		);

		htmlSpy.mockRestore();
	});
});
