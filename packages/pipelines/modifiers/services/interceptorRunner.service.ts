/**
 * @fileoverview Executes interceptors in order, controls next() flow, prevents duplicate calls,
 * and wraps interceptor failures in InterceptorError.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { InterceptorError } from "../../../errors/modifiers/InterceptorError.js";
import type { IInterceptor, IPipelineContext } from "../../pipeline.types.js";

export async function runInterceptors(
	interceptors: IInterceptor[],
	ctx: IPipelineContext,
	invokeController: () => Promise<unknown>,
): Promise<unknown> {
	let lastIndex = -1;

	async function dispatch(i: number): Promise<unknown> {
		if (i <= lastIndex) {
			throw new InterceptorError(
				interceptors[i - 1]?.name,
				new Error(
					"[Subatom] next() was called more than once by the same interceptor.",
				),
			);
		}
		lastIndex = i;

		if (i === interceptors.length) {
			return invokeController();
		}

		const interceptor = interceptors[i];

		try {
			return await interceptor?.intercept(ctx, () => dispatch(i + 1));
		} catch (cause) {
			if (cause instanceof InterceptorError) throw cause;
			throw new InterceptorError(interceptor?.name, cause);
		}
	}

	return dispatch(0);
}
