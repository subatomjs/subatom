/**
 * @fileoverview Merges application and router pipeline configurations,
 * combining, deduplicating, and priority-sorting transformers, interceptors, and serializers.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { sortedByPriority } from "../../pipeline.types.js";
import type { IRequestPipelineConfig } from "../types/modifiers.types.js";

function deduplicate<T extends object>(items: readonly T[]): T[] {
	const seen = new Set<T>();
	const result: T[] = [];
	for (const item of items) {
		if (item && !seen.has(item)) {
			seen.add(item);
			result.push(item);
		}
	}
	return result;
}

export function mergePipelineConfigs(
	appConfig: IRequestPipelineConfig,
	routerConfig?: IRequestPipelineConfig,
): IRequestPipelineConfig {
	if (!routerConfig) return appConfig;

	const transformers = deduplicate([
		...(appConfig.transformers || []),
		...(routerConfig.transformers || []),
	]);

	const interceptors = deduplicate([
		...(appConfig.interceptors || []),
		...(routerConfig.interceptors || []),
	]);

	const serializers = deduplicate([
		...(appConfig.serializers || []),
		...(routerConfig.serializers || []),
	]);

	return {
		transformers: sortedByPriority(transformers),
		interceptors: sortedByPriority(interceptors),
		serializers: sortedByPriority(serializers),
	};
}
