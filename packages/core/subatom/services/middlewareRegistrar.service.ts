/**
 * @fileoverview Registers middleware functions, distinguishing standard middleware
 * from 4-argument error middleware and storing them in their respective collections.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type {
	ErrorMiddlewareHandler,
	MiddlewareHandler,
} from "../../../pipelines/pipeline.types.js";

export function registerMiddleware(
	middlewares: MiddlewareHandler[],
	errorMiddlewares: ErrorMiddlewareHandler[],
	fnOrPrefix: MiddlewareHandler | ErrorMiddlewareHandler | unknown,
): void {
	if (typeof fnOrPrefix === "function") {
		if (fnOrPrefix.length === 4) {
			errorMiddlewares.push(fnOrPrefix as ErrorMiddlewareHandler);
		} else {
			middlewares.push(fnOrPrefix as MiddlewareHandler);
		}
	}
}
