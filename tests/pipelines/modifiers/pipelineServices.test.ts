/** biome-ignore-all lint/suspicious/noExplicitAny: explanation */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	registerTransformer,
	registerInterceptor,
	registerSerializer,
} from "../../../packages/pipelines/modifiers/services/pipelineRegistrar.service.js";
import { mergePipelineConfigs } from "../../../packages/pipelines/modifiers/services/pipelineMerger.service.js";
import { runInterceptors } from "../../../packages/pipelines/modifiers/services/interceptorRunner.service.js";
import { runTransformerHook } from "../../../packages/pipelines/modifiers/services/transformerRunner.service.js";
import { runSerializers } from "../../../packages/pipelines/modifiers/services/serializerRunner.service.js";
import {
	createResponseCapture,
	flushCapturedResponse,
} from "../../../packages/pipelines/modifiers/services/responseCapture.service.js";
import { InterceptorError } from "../../../packages/errors/modifiers/InterceptorError.js";
import { TransformerError } from "../../../packages/errors/modifiers/TransformerError.js";
import { SerializerError } from "../../../packages/errors/modifiers/SerializerError.js";
import type {
	IInterceptor,
	IPipelineContext,
	ISerializer,
	ITransformer,
} from "../../../packages/pipelines/pipeline.types.js";
import type { IResponse } from "../../../packages/core/http/response/types/response.types.js";

function createMockContext(
	overrides?: Partial<IPipelineContext>,
): IPipelineContext {
	return {
		req: {} as any,
		res: {
			get: vi.fn(),
		} as unknown as IResponse,
		routePath: "/test",
		method: "GET",
		meta: Object.freeze({}),
		state: {},
		...overrides,
	};
}

describe("Pipeline Services", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("pipelineRegistrar.service", () => {
		describe("registerTransformer", () => {
			it("should throw TypeError when transformer is not a plain object", () => {
				const bucket: ITransformer[] = [];
				expect(() => registerTransformer(bucket, null as any)).toThrow(
					"[Subatom] transformer() must be a plain object.",
				);
				expect(() => registerTransformer(bucket, [] as any)).toThrow(
					"[Subatom] transformer() must be a plain object.",
				);
				expect(() => registerTransformer(bucket, "invalid" as any)).toThrow(
					"[Subatom] transformer() must be a plain object.",
				);
			});

			it("should throw TypeError when transformer has no lifecycle hooks", () => {
				const bucket: ITransformer[] = [];
				expect(() => registerTransformer(bucket, {} as any)).toThrow(
					"[Subatom] transformer() requires at least one of: beforeRequest, afterRequest, beforeResponse, afterResponse.",
				);
			});

			it("should register valid transformer and sort bucket by priority", () => {
				const bucket: ITransformer[] = [];
				const t1: ITransformer = { beforeRequest: vi.fn(), priority: 1 };
				const t2: ITransformer = { afterRequest: vi.fn(), priority: 10 };

				registerTransformer(bucket, t2);
				registerTransformer(bucket, t1);

				expect(bucket).toHaveLength(2);
				expect(bucket[0]).toBe(t1);
				expect(bucket[1]).toBe(t2);
			});
		});

		describe("registerInterceptor", () => {
			it("should throw TypeError when interceptor is not a plain object", () => {
				const bucket: IInterceptor[] = [];
				expect(() => registerInterceptor(bucket, null as any)).toThrow(
					"[Subatom] intercept() must be a plain object.",
				);
			});

			it("should throw TypeError when intercept method is missing or not a function", () => {
				const bucket: IInterceptor[] = [];
				expect(() => registerInterceptor(bucket, {} as any)).toThrow(
					"[Subatom] intercept() requires an `intercept(ctx, next)` function.",
				);
			});

			it("should register valid interceptor and maintain sorted bucket", () => {
				const bucket: IInterceptor[] = [];
				const i1: IInterceptor = { intercept: vi.fn(), priority: 5 };
				const i2: IInterceptor = { intercept: vi.fn(), priority: 20 };

				registerInterceptor(bucket, i2);
				registerInterceptor(bucket, i1);

				expect(bucket[0]).toBe(i1);
				expect(bucket[1]).toBe(i2);
			});
		});

		describe("registerSerializer", () => {
			it("should throw TypeError when serializer is not a plain object", () => {
				const bucket: ISerializer[] = [];
				expect(() => registerSerializer(bucket, null as any)).toThrow(
					"[Subatom] serializer() must be a plain object.",
				);
			});

			it("should throw TypeError when serialize method is missing", () => {
				const bucket: ISerializer[] = [];
				expect(() => registerSerializer(bucket, {} as any)).toThrow(
					"[Subatom] serializer() requires a `serialize(data, ctx)` function.",
				);
			});

			it("should register valid serializer and sort bucket", () => {
				const bucket: ISerializer[] = [];
				const s1: ISerializer = { serialize: vi.fn(), priority: 2 };
				const s2: ISerializer = { serialize: vi.fn(), priority: 8 };

				registerSerializer(bucket, s2);
				registerSerializer(bucket, s1);

				expect(bucket[0]).toBe(s1);
				expect(bucket[1]).toBe(s2);
			});
		});
	});

	describe("pipelineMerger.service", () => {
		it("should return appConfig directly if routerConfig is undefined", () => {
			const appConfig = {
				transformers: [],
				interceptors: [],
				serializers: [],
			};
			expect(mergePipelineConfigs(appConfig, undefined)).toBe(appConfig);
		});

		it("should merge, deduplicate, and sort modifiers across configs", () => {
			const t1: ITransformer = { beforeRequest: vi.fn(), priority: 1 };
			const t2: ITransformer = { afterRequest: vi.fn(), priority: 10 };
			const i1: IInterceptor = { intercept: vi.fn(), priority: 5 };
			const s1: ISerializer = { serialize: vi.fn(), priority: 2 };

			const appConfig = {
				transformers: [t2],
				interceptors: [i1],
				serializers: [s1],
			};

			const routerConfig = {
				transformers: [t1, t2], // t2 duplicate
				interceptors: [i1], // i1 duplicate
				serializers: [],
			};

			const merged = mergePipelineConfigs(appConfig, routerConfig);

			expect(merged.transformers).toEqual([t1, t2]);
			expect(merged.interceptors).toEqual([i1]);
			expect(merged.serializers).toEqual([s1]);
		});
	});

	describe("interceptorRunner.service", () => {
		it("should execute interceptors in sequence and invoke controller", async () => {
			const executionOrder: string[] = [];
			const ctx = createMockContext();

			const i1: IInterceptor = {
				name: "First",
				intercept: async (_context, next) => {
					executionOrder.push("i1-start");
					const res = await next();
					executionOrder.push("i1-end");
					return res;
				},
			};

			const i2: IInterceptor = {
				name: "Second",
				intercept: async (_context, next) => {
					executionOrder.push("i2-start");
					const res = await next();
					executionOrder.push("i2-end");
					return res;
				},
			};

			const controller = vi.fn(async () => {
				executionOrder.push("controller");
				return "data";
			});

			const result = await runInterceptors([i1, i2], ctx, controller);

			expect(result).toBe("data");
			expect(executionOrder).toEqual([
				"i1-start",
				"i2-start",
				"controller",
				"i2-end",
				"i1-end",
			]);
		});

		it("should throw InterceptorError when next() is called multiple times by the same interceptor", async () => {
			const ctx = createMockContext();
			const badInterceptor: IInterceptor = {
				name: "DoubleCaller",
				intercept: async (_context, next) => {
					await next();
					return next();
				},
			};

			await expect(
				runInterceptors([badInterceptor], ctx, async () => "ok"),
			).rejects.toThrow(InterceptorError);
		});

		it("should propagate downstream controller errors without wrapping them in InterceptorError", async () => {
			const ctx = createMockContext();
			const interceptor: IInterceptor = {
				name: "PassThrough",
				intercept: async (_context, next) => next(),
			};

			const customErr = new Error("Controller DB error");

			await expect(
				runInterceptors([interceptor], ctx, async () => {
					throw customErr;
				}),
			).rejects.toThrow(customErr);
		});

		it("should wrap uncaught interceptor errors in InterceptorError", async () => {
			const ctx = createMockContext();
			const failingInterceptor: IInterceptor = {
				name: "BuggyInterceptor",
				intercept: async () => {
					throw new Error("Internal crash");
				},
			};

			await expect(
				runInterceptors([failingInterceptor], ctx, async () => "ok"),
			).rejects.toThrow(InterceptorError);
		});
	});

	describe("transformerRunner.service", () => {
		it("should invoke beforeRequest hooks passing context only", async () => {
			const ctx = createMockContext();
			const t1: ITransformer = {
				name: "T1",
				beforeRequest: vi.fn(async (_context) => {
					ctx.state.t1 = true;
				}),
			};

			await runTransformerHook([t1], "beforeRequest", ctx, ctx);

			expect(t1.beforeRequest).toHaveBeenCalledWith(ctx);
			expect(ctx.state.t1).toBe(true);
		});

		it("should pipe output through sequential hooks and ignore undefined returns", async () => {
			const ctx = createMockContext();
			const t1: ITransformer = {
				afterRequest: async (data) => (data as number) * 2,
			};
			const t2: ITransformer = {
				afterRequest: async () => undefined, // Retains previous current
			};
			const t3: ITransformer = {
				afterRequest: async (data) => (data as number) + 5,
			};

			const result = await runTransformerHook(
				[t1, t2, t3],
				"afterRequest",
				10,
				ctx,
			);
			expect(result).toBe(25);
		});

		it("should wrap hook errors in TransformerError", async () => {
			const ctx = createMockContext();
			const faultyTransformer: ITransformer = {
				name: "Faulty",
				beforeResponse: async () => {
					throw new Error("Transformation failed");
				},
			};

			await expect(
				runTransformerHook([faultyTransformer], "beforeResponse", {}, ctx),
			).rejects.toThrow(TransformerError);
		});
	});

	describe("serializerRunner.service", () => {
		it("should select serializer matching normalized content-type", async () => {
			const ctx = createMockContext();
			const sXml: ISerializer = {
				contentType: "application/xml",
				serialize: async (data) => `<data>${data}</data>`,
			};
			const sJson: ISerializer = {
				contentType: "application/json",
				serialize: async (data) => JSON.stringify(data),
			};

			const result = await runSerializers(
				[sXml, sJson],
				{ id: 1 },
				ctx,
				"application/json; charset=utf-8",
			);

			expect(result).toBe('{"id":1}');
		});

		it("should infer application/json for objects if content-type is unspecified", async () => {
			const ctx = createMockContext();
			const sJson: ISerializer = {
				contentType: "application/json",
				serialize: async (data) => JSON.stringify(data),
			};

			const result = await runSerializers([sJson], { active: true }, ctx);
			expect(result).toBe('{"active":true}');
		});

		it("should fallback to raw data if no serializer matches or data returned is undefined", async () => {
			const ctx = createMockContext();
			const sXml: ISerializer = {
				contentType: "application/xml",
				serialize: async () => undefined,
			};

			const result = await runSerializers(
				[sXml],
				"plain-text",
				ctx,
				"text/plain",
			);
			expect(result).toBe("plain-text");
		});

		it("should wrap serializer exceptions in SerializerError", async () => {
			const ctx = createMockContext();
			const brokenSerializer: ISerializer = {
				name: "XmlSerializer",
				serialize: async () => {
					throw new Error("Parse failure");
				},
			};

			await expect(
				runSerializers([brokenSerializer], { test: 1 }, ctx),
			).rejects.toThrow(SerializerError);
		});
	});

	describe("responseCapture.service", () => {
		it("should proxy non-terminal methods and enable method chaining", () => {
			const realRes = {
				headersSent: false,
				writableEnded: false,
				finished: false,
				statusCode: 200,
				status(this: { statusCode: number }, code: number) {
					this.statusCode = code;
					return this;
				},
			} as unknown as IResponse;

			const { res: proxy } = createResponseCapture(realRes);

			const chained = proxy.status(201);
			expect(chained).toBe(proxy);
			expect(realRes.statusCode).toBe(201);
		});

		it("should capture terminal methods and resolve captured promise", async () => {
			const realRes = {
				headersSent: false,
				writableEnded: false,
				finished: false,
				json: vi.fn(),
			} as unknown as IResponse;

			const { res: proxy, captured } = createResponseCapture(realRes);

			proxy.json({ success: true });

			const capturedData = await captured;
			expect(capturedData).toEqual({
				method: "json",
				args: [{ success: true }],
			});
			expect(proxy.headersSent).toBe(true);
			expect(proxy.writableEnded).toBe(true);
		});

		it("should throw error if a terminal method is called a second time", () => {
			const realRes = {
				headersSent: false,
				writableEnded: false,
				finished: false,
				send: vi.fn(),
			} as unknown as IResponse;

			const { res: proxy } = createResponseCapture(realRes);
			proxy.send("first");

			expect(() => proxy.send("second")).toThrow(
				'[Subatom] Response already sent — "send" was called a second time.',
			);
		});

		it("should flush captured response to real response instance", () => {
			const realRes = {
				json: vi.fn(),
			} as unknown as IResponse;

			flushCapturedResponse(realRes, "json", [{ message: "ok" }]);
			expect(realRes.json).toHaveBeenCalledWith({ message: "ok" });
		});

		it("should throw error when flushing to an undefined method on IResponse", () => {
			const realRes = {} as IResponse;
			expect(() => flushCapturedResponse(realRes, "nonExistent", [])).toThrow(
				'[Subatom] Cannot flush response: "nonExistent" is not a function on IResponse.',
			);
		});
	});
});
