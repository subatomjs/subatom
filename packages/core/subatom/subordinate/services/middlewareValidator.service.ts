/**
 * @fileoverview Validates and collects middleware functions, supporting both individual
 *  handlers and arrays while rejecting invalid values.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { MiddlewareHandler } from "../../../../pipelines/pipeline.types.js";

function assertIsFunction(value: unknown, label: string): void {
	if (typeof value !== "function") {
		throw new TypeError(
			`[Subatom] .${label}() only accepts functions (or arrays of functions).`,
		);
	}
}

export function collectMiddlewares(
	ownMiddlewares: MiddlewareHandler[],
	...handlers: Array<MiddlewareHandler | MiddlewareHandler[]>
): void {
	for (const entry of handlers) {
		if (Array.isArray(entry)) {
			for (const fn of entry) {
				assertIsFunction(fn, "middleware");
				ownMiddlewares.push(fn);
			}
		} else {
			assertIsFunction(entry, "middleware");
			ownMiddlewares.push(entry);
		}
	}
}
