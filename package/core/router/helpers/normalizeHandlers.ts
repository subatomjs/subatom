import type {
	ResourceAction,
	ResourceHandlers,
} from "../../../types/framework/router/IResourceRouter.js";
import type { IHandler } from "../../../types/framework/router/IRouter.js";

/**
 * Normalizes a controller action's value (single handler or array of
 * handlers) into a flat handler array, validating every entry along the way.
 * Fails fast with a descriptive error rather than letting a bad controller
 * blow up later inside the request pipeline.
 */
export function normalizeHandlers(
	value: ResourceHandlers,
	basePath: string,
	action: ResourceAction,
): IHandler[] {
	const handlers = Array.isArray(value) ? value : [value];

	if (handlers.length === 0) {
		throw new TypeError(
			`[Subatom] router.resource("${basePath}"): action "${action}" has an empty handler array.`,
		);
	}

	for (const handler of handlers) {
		if (typeof handler !== "function") {
			throw new TypeError(
				`[Subatom] router.resource("${basePath}"): action "${action}" must be a function ` +
					`or an array of functions.`,
			);
		}
	}

	return handlers;
}
