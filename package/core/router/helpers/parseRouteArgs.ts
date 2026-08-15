// core/router/helpers/parseRouteArgs.ts

import type {
	IHandler,
	IRouteOptions,
} from "../../../types/framework/router/IRouter.js";

export interface ParsedRouteArgs {
	handlers: IHandler[];
	options: IRouteOptions;
}

function isRouteOptions(value: unknown): value is IRouteOptions {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		typeof value !== "function"
	);
}

/**
 * Splits a verb registration's variadic arguments into handler functions
 * and an optional trailing options object, e.g.
 *   get("/users/:id", auth, getUser, { name: "users.get" })
 * → { handlers: [auth, getUser], options: { name: "users.get" } }
 *
 * Only the *last* argument is checked — options in the middle of a
 * handler list is treated as a handler and will fail the existing
 * "non-function handler" validation in registerWithMeta, which is the
 * correct behavior (options only make sense as the final argument).
 */
export function parseRouteArgs(
	args: Array<IHandler | IRouteOptions>,
): ParsedRouteArgs {
	if (args.length === 0) {
		return { handlers: [], options: {} };
	}

	const last = args[args.length - 1];
	if (isRouteOptions(last)) {
		return {
			handlers: args.slice(0, -1) as IHandler[],
			options: last,
		};
	}

	return { handlers: args as IHandler[], options: {} };
}
