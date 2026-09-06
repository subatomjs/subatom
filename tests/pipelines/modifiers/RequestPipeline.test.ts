import { describe, it, expect, vi, beforeEach } from "vitest";
import { RequestPipeline } from "../../../packages/pipelines/modifiers/RequestPipeline.js";
import type { IRequest } from "../../../packages/core/http/request/types/request.types.js";
import type { IResponse } from "../../../packages/core/http/response/types/response.types.js";
import type {
	IInterceptor,
	ISerializer,
	ITransformer,
} from "../../../packages/pipelines/pipeline.types.js";

describe("RequestPipeline", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should deduplicate duplicate modifier references in constructor", () => {
		const t1: ITransformer = { beforeRequest: vi.fn() };
		const i1: IInterceptor = { intercept: vi.fn() };
		const s1: ISerializer = { serialize: vi.fn() };

		const pipeline = new RequestPipeline({
			transformers: [t1, t1],
			interceptors: [i1, i1],
			serializers: [s1, s1],
		});

		const config = (pipeline as unknown as { config: any }).config;
		expect(config.transformers).toHaveLength(1);
		expect(config.interceptors).toHaveLength(1);
		expect(config.serializers).toHaveLength(1);
	});

	it("should execute all lifecycle phases in exact sequential order", async () => {
		const executionOrder: string[] = [];

		const transformer: ITransformer = {
			beforeRequest: async (ctx) => {
				executionOrder.push("beforeRequest");
				ctx.state.started = true;
			},
			afterRequest: async (data) => {
				executionOrder.push("afterRequest");
				return { ...(data as object), afterRequest: true };
			},
			beforeResponse: async (data) => {
				executionOrder.push("beforeResponse");
				return { ...(data as object), beforeResponse: true };
			},
			afterResponse: async (data) => {
				executionOrder.push("afterResponse");
				return { ...(data as object), afterResponse: true };
			},
		};

		const serializer: ISerializer = {
			contentType: "application/json",
			serialize: async (data) => {
				executionOrder.push("serializer");
				return { ...(data as object), serialized: true };
			},
		};

		const pipeline = new RequestPipeline({
			transformers: [transformer],
			interceptors: [],
			serializers: [serializer],
		});

		const req = { path: "/users", method: "POST" } as IRequest;
		const res = {
			get: vi.fn().mockReturnValue("application/json"),
		} as unknown as IResponse;

		const result = await pipeline.execute({
			req,
			res,
			meta: { tag: "test" },
			runControllerChain: async () => {
				executionOrder.push("controller");
				return { initial: "payload" };
			},
		});

		expect(executionOrder).toEqual([
			"beforeRequest",
			"controller",
			"afterRequest",
			"beforeResponse",
			"serializer",
			"afterResponse",
		]);

		expect(result).toEqual({
			initial: "payload",
			afterRequest: true,
			beforeResponse: true,
			serialized: true,
			afterResponse: true,
		});
	});

	it("should fallback routePath and method when omitted from options", async () => {
		let capturedPath = "";
		let capturedMethod = "";

		const transformer: ITransformer = {
			beforeRequest: async (ctx) => {
				capturedPath = ctx.routePath ?? "";
				capturedMethod = ctx.method ?? "";
			},
		};

		const pipeline = new RequestPipeline({
			transformers: [transformer],
			interceptors: [],
			serializers: [],
		});

		const req = {} as IRequest;
		const res = {} as IResponse;

		await pipeline.execute({
			req,
			res,
			runControllerChain: async () => "ok",
		});

		expect(capturedPath).toBe("");
		expect(capturedMethod).toBe("GET");
	});
});