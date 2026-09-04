/**
 * @fileoverview Executes transformer hooks sequentially, passes transformed data through each hook,
 * and wraps failures in TransformerError.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { TransformerError } from "../../../errors/modifiers/TransformerError.js";
import type { IPipelineContext, ITransformer } from "../../pipeline.types.js";
import type { HookName } from "../types/modifiers.types.js";

export async function runTransformerHook(
	transformers: ITransformer[],
	hook: HookName,
	value: unknown,
	ctx: IPipelineContext,
): Promise<unknown> {
	let current = value;

	for (const transformer of transformers) {
		const fn = transformer[hook];
		if (typeof fn !== "function") continue;

		try {
			let result: unknown;
			if (hook === "beforeRequest") {
				// beforeRequest signature is (ctx: IPipelineContext)
				result = await (fn as (context: IPipelineContext) => unknown)(ctx);
			} else {
				// afterRequest, beforeResponse, afterResponse signature is (data: unknown, ctx: IPipelineContext)
				result = await (
					fn as (data: unknown, context: IPipelineContext) => unknown
				)(current, ctx);
			}
			current = result === undefined ? current : result;
		} catch (cause) {
			throw new TransformerError(hook, transformer.name, cause);
		}
	}

	return current;
}
