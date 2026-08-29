/**
 * @fileoverview Merges application and router pipeline configurations,
 * combining and priority-sorting transformers, interceptors, and serializers.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { sortedByPriority } from "../../pipeline.types.js";
import type { IRequestPipelineConfig } from "../types/modifiers.types.js";

export function mergePipelineConfigs(
	appConfig: IRequestPipelineConfig,
	routerConfig?: IRequestPipelineConfig,
): IRequestPipelineConfig {
	if (!routerConfig) return appConfig;

	return {
		transformers: sortedByPriority([
			...appConfig.transformers,
			...routerConfig.transformers,
		]),
		interceptors: sortedByPriority([
			...appConfig.interceptors,
			...routerConfig.interceptors,
		]),
		serializers: sortedByPriority([
			...appConfig.serializers,
			...routerConfig.serializers,
		]),
	};
}
