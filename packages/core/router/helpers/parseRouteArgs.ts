/**
 * @fileoverview Identifies route option/meta objects and parses route arguments
 * into handlers and metadata options.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type {
	IHandler,
	IRouteMetaOptions,
	IRouteOptions,
	ParsedRouteArgs,
	RouteArgument,
} from "../types/router.types.js";

export function isRouteOptions(value: unknown): value is IRouteOptions {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		typeof value !== "function" &&
		"controller" in value &&
		typeof (value as Record<string, unknown>).controller === "function"
	);
}

export function isRouteMetaOptions(value: unknown): value is IRouteMetaOptions {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		typeof value !== "function" &&
		!("controller" in value)
	);
}

export function parseRouteArgs(args: Array<RouteArgument>): ParsedRouteArgs {
	if (args.length === 0) {
		return { handlers: [], options: {} };
	}

	const last = args[args.length - 1];
	if (isRouteMetaOptions(last)) {
		return {
			handlers: args.slice(0, -1) as unknown as IHandler[],
			options: last,
		};
	}

	return { handlers: args as unknown as IHandler[], options: {} };
}
