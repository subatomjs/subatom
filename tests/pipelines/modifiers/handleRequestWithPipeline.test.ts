import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleRequestWithPipeline } from "../../../packages/pipelines/modifiers/handleRequestWithPipeline.js";
import { ErrorFormatter } from "../../../packages/errors/ErrorFormatter.js";
import type { Router } from "../../../packages/core/router/Router.js";
import type { IRequest } from "../../../packages/core/http/request/types/request.types.js";
import type { IResponse } from "../../../packages/core/http/response/types/response.types.js";
import type { IRequestPipelineConfig } from "../../../packages/pipelines/modifiers/types/modifiers.types.js";

vi.mock("../../../packages/errors/ErrorFormatter.js", () => ({
	ErrorFormatter: {
		handle: vi.fn(),
	},
}));

describe("handleRequestWithPipeline", () => {
	let router: Router;
	let appPipelineConfig: IRequestPipelineConfig;

	beforeEach(() => {
		vi.clearAllMocks();
		appPipelineConfig = {
			transformers: [],
			interceptors: [],
			serializers: [],
		};

		router = {
			match: vi.fn().mockReturnValue(null),
			dispatch: vi.fn().mockResolvedValue(undefined),
		} as unknown as Router;
	});

	function createMockReqRes(options: {
		url?: string;
		path?: string;
		method?: string;
		writableEnded?: boolean;
	}) {
		const req = {
			url: options.url,
			path: options.path,
			method: options.method ?? "GET",
		} as IRequest;

		const res = {
			writableEnded: options.writableEnded ?? false,
			headersSent: false,
			json: vi.fn(),
			send: vi.fn(),
			end: vi.fn(),
			status: vi.fn().mockReturnThis(),
		} as unknown as IResponse;

		return { req, res };
	}

	it("should parse clean path from URL, run pipeline, and flush response from controller return", async () => {
		const { req, res } = createMockReqRes({ url: "/api/items?filter=active", method: "GET" });

		vi.mocked(router.match).mockReturnValueOnce({
			route: {
				path: "/api/items",
				routerPipeline: {
					transformers: [],
					interceptors: [],
					serializers: [],
				},
			},
		} as any);

		vi.mocked(router.dispatch).mockResolvedValueOnce({ count: 5 } as never);

		await handleRequestWithPipeline(router, req, res, appPipelineConfig);

		expect(res.json).toHaveBeenCalledWith({ count: 5 });
		expect(ErrorFormatter.handle).not.toHaveBeenCalled();
	});

	it("should flush using terminal capture method when handler calls res.send()", async () => {
		const { req, res } = createMockReqRes({ path: "/text" });

		vi.mocked(router.dispatch).mockImplementationOnce(async (_req, capturedRes: any) => {
			capturedRes.send("Hello World");
		});

		await handleRequestWithPipeline(router, req, res, appPipelineConfig);

		expect(res.send).toHaveBeenCalledWith("Hello World");
	});

	it("should catch pipeline failures and delegate to ErrorFormatter.handle", async () => {
		const { req, res } = createMockReqRes({ path: "/error" });
		const pipelineError = new Error("Controller crashed");

		vi.mocked(router.dispatch).mockRejectedValueOnce(pipelineError);

		await handleRequestWithPipeline(router, req, res, appPipelineConfig);

		expect(ErrorFormatter.handle).toHaveBeenCalledWith(
			expect.objectContaining({ message: "Controller crashed" }),
			req,
			res,
		);
	});

	it("should log error and avoid ErrorFormatter if response has already writableEnded", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const { req, res } = createMockReqRes({ path: "/late-error", writableEnded: true });

		vi.mocked(router.dispatch).mockRejectedValueOnce(new Error("Late failure"));

		await handleRequestWithPipeline(router, req, res, appPipelineConfig);

		expect(consoleSpy).toHaveBeenCalledWith(
			"[Subatom Error]: Unhandled error occurred after response was already sent.",
			expect.any(Error),
		);
		expect(ErrorFormatter.handle).not.toHaveBeenCalled();
	});

	it("should log error if handler chain rejects after response has already been captured", async () => {
		const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const { req, res } = createMockReqRes({ path: "/double-action" });

		vi.mocked(router.dispatch).mockImplementationOnce((_req, capturedRes: any) => {
			capturedRes.json({ first: true });
			return new Promise((_, reject) => {
				setTimeout(() => {
					reject(new Error("Post-capture rejection"));
				}, 10);
			});
		});

		await handleRequestWithPipeline(router, req, res, appPipelineConfig);

		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(consoleSpy).toHaveBeenCalledWith(
			"[Subatom Error]: Handler chain rejected after response was already captured.",
			expect.any(Error),
		);
	});

	it("should fallback gracefully if rawUrl fails URL parsing in extractCleanPath", async () => {
		const { req, res } = createMockReqRes({ url: "::invalid-url::" });
		vi.mocked(router.dispatch).mockResolvedValueOnce("ok" as never);

		await handleRequestWithPipeline(router, req, res, appPipelineConfig);

		expect(res.json).toHaveBeenCalledWith("ok");
	});
});