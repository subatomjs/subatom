/**
 * @fileoverview Executes interceptors in order, controls next() flow, prevents duplicate calls,
 * and wraps interceptor failures in InterceptorError without swallowing downstream errors.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { InterceptorError } from "../../../errors/modifiers/InterceptorError.js";
import type { IInterceptor, IPipelineContext } from "../../pipeline.types.js";

// Sentinel marker to track if the thrown error originated downstream
const DOWNSTREAM_ERROR_TAG = Symbol("SUBATOM_DOWNSTREAM_ERROR");

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
			try {
				return await invokeController();
			} catch (err: unknown) {
				// Mark errors coming from controller / pipeline validation so interceptors won't wrap them
				if (err && typeof err === "object") {
					(err as Record<symbol, boolean>)[DOWNSTREAM_ERROR_TAG] = true;
				}
				throw err;
			}
		}

		const interceptor = interceptors[i];

		const next = async (): Promise<unknown> => {
			try {
				return await dispatch(i + 1);
			} catch (err: unknown) {
				if (err && typeof err === "object") {
					(err as Record<symbol, boolean>)[DOWNSTREAM_ERROR_TAG] = true;
				}
				throw err;
			}
		};

		try {
			return await interceptor?.intercept(ctx, next);
		} catch (cause: unknown) {
			// If the error originated from downstream inside next(), propagate it as-is
			if (
				cause instanceof InterceptorError ||
				(cause &&
					typeof cause === "object" &&
					(cause as Record<symbol, boolean>)[DOWNSTREAM_ERROR_TAG])
			) {
				throw cause;
			}

			// Only wrap if the interceptor itself threw an uncaught error
			throw new InterceptorError(interceptor?.name, cause);
		}
	}

	return dispatch(0);
}
