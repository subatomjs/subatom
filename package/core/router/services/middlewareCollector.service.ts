import type {
	IHandler,
	IRoute,
} from "../../../types/framework/router/IRouter.js";
import { matchPath } from "./pathMatcher.service.js";

const MIDDLEWARE_METHOD = "USE";

export function collectUseMiddlewares(
	routes: IRoute[],
	pathName: string,
): { handlers: IHandler[]; params: Record<string, string> } {
	const handlers: IHandler[] = [];
	const params: Record<string, string> = Object.create(null);

	for (const route of routes) {
		if (route.method !== MIDDLEWARE_METHOD) continue;

		const matched = matchPath(route.path, pathName, { prefix: true });
		if (matched !== null) {
			Object.assign(params, matched);
			handlers.push(...route.handlers);
		}
	}

	return { handlers, params };
}
