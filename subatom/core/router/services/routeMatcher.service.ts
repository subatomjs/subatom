import type {
	IMatchResult,
	IRoute,
} from "../../../types/framework/router/IRouter.js";
import { matchPath } from "./pathMatcher.service.js";
import { extractPathname, extractQuery } from "./urlParser.service.js";

const MIDDLEWARE_METHOD = "USE";
const WILDCARD_METHOD = "ALL";

export function matchRoute(
	routes: IRoute[],
	method: string = "GET",
	rawUrl: string = "/",
): IMatchResult | undefined {
	const pathName = extractPathname(rawUrl);
	const query = extractQuery(rawUrl);
	const targetMethod = (method || "GET").toUpperCase();

	for (const route of routes) {
		if (route.method === MIDDLEWARE_METHOD) continue;
		if (route.method !== targetMethod && route.method !== WILDCARD_METHOD) {
			continue;
		}

		const params = matchPath(route.path, pathName);
		if (params !== null) {
			return { route, params, query };
		}
	}

	return undefined;
}
