import { describe, expect, it } from "vitest";
import type { IRequestPipelineConfig } from "../../../package/core/pipeline/modifier/RequestPipeline.js";
import { mergePipelineConfigs } from "../../../package/core/pipeline/modifier/services/pipelineMerger.service.js";

describe("mergePipelineConfigs", () => {
	it("returns app config unchanged if router config is undefined", () => {
		const appConfig: IRequestPipelineConfig = {
			transformers: [],
			interceptors: [],
			serializers: [],
		};
		expect(mergePipelineConfigs(appConfig, undefined)).toBe(appConfig);
	});

	it("merges app and router pipelines maintaining priority order", () => {
		const appConfig: IRequestPipelineConfig = {
			transformers: [{ priority: 10, name: "appT" }],
			interceptors: [{ priority: 2, intercept: async (c, n) => n() }],
			serializers: [],
		};

		const routerConfig: IRequestPipelineConfig = {
			transformers: [{ priority: 1, name: "routeT" }],
			interceptors: [{ priority: -1, intercept: async (c, n) => n() }],
			serializers: [],
		};

		const merged = mergePipelineConfigs(appConfig, routerConfig);

		expect(merged.transformers.map((t) => t.name)).toEqual(["routeT", "appT"]);
		expect(merged.interceptors.map((i) => i.priority)).toEqual([-1, 2]);
	});
});
