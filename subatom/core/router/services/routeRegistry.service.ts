import type {
	IHandler,
	IRoute,
	IRouteMeta,
} from "../../../types/framework/router/IRouter.js";

export function registerWithMeta(
	routes: IRoute[],
	method: string,
	path: string,
	handlers: IHandler[],
	meta?: IRouteMeta,
): void {
	if (!method || typeof method !== "string") {
		throw new TypeError(
			"[Subatom] Router.registerWithMeta: 'method' must be a non-empty string.",
		);
	}

	if (!Array.isArray(handlers) || handlers.length === 0) {
		throw new TypeError(
			`[Subatom] Router.registerWithMeta: route "${method.toUpperCase()} ${
				path || "/"
			}" requires at least one handler function.`,
		);
	}

	for (const handler of handlers) {
		if (typeof handler !== "function") {
			throw new TypeError(
				`[Subatom] Router.registerWithMeta: route "${method.toUpperCase()} ${
					path || "/"
				}" received a non-function handler.`,
			);
		}
	}

	const cleanPath = ("/" + (path || "/")).replace(/\/+/g, "/");

	const route: IRoute = {
		method: method.toUpperCase(),
		path: cleanPath,
		handlers,
	};

	if (meta?.tags && meta.tags.length > 0) {
		route.tags = meta.tags;
	}

	if (meta?.rateLimit) {
		route.rateLimit = meta.rateLimit;
	}

	routes.push(route);
}
