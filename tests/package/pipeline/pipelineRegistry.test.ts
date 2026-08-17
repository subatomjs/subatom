import { describe, expect, it } from "vitest";
import {
	registerInterceptor,
	registerSerializer,
	registerTransformer,
} from "../../../package/core/pipeline/modifier/services/pipelineRegistrar.service.js";
import type {
	IInterceptor,
	ISerializer,
	ITransformer,
} from "../../../package/types/framework/pipeline/IPipeline.js";

describe("Pipeline Component Registration", () => {
	it("registers valid transformers and sorts them by priority in-place", () => {
		const bucket: ITransformer[] = [];
		registerTransformer(bucket, { priority: 10, beforeRequest: (r) => r });
		registerTransformer(bucket, { priority: -5, afterResponse: (r) => r });
		registerTransformer(bucket, { priority: 0, beforeResponse: (r) => r });

		expect(bucket.map((b) => b.priority)).toEqual([-5, 0, 10]);
	});

	it("throws TypeError if transformer is not an object or lacks hooks", () => {
		const bucket: ITransformer[] = [];
		expect(() => registerTransformer(bucket, null as any)).toThrow(TypeError);
		expect(() => registerTransformer(bucket, {} as any)).toThrow(TypeError);
	});

	it("registers valid interceptors and enforces function requirement", () => {
		const bucket: IInterceptor[] = [];
		registerInterceptor(bucket, {
			priority: 1,
			intercept: async (ctx, next) => next(),
		});
		expect(bucket.length).toBe(1);
		expect(() => registerInterceptor(bucket, { priority: 1 } as any)).toThrow(
			TypeError,
		);
	});

	it("registers valid serializers and enforces serialize function requirement", () => {
		const bucket: ISerializer[] = [];
		registerSerializer(bucket, { serialize: (d) => d });
		expect(bucket.length).toBe(1);
		expect(() => registerSerializer(bucket, {} as any)).toThrow(TypeError);
	});
});
