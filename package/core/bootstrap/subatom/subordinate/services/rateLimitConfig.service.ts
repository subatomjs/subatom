import type { MiddlewareHandler } from "../../../../../types/http/IMiddleware.js";
import { createRateLimitMiddleware } from "../../helpers/createRateLimitMiddleware.js";
import { parseRateLimitSpec } from "../../helpers/parseRateLimitSpec.js";

export function configureRateLimit(spec: string): {
	spec: string;
	middleware: MiddlewareHandler;
} {
	parseRateLimitSpec(spec);
	const middleware = createRateLimitMiddleware(spec);
	return { spec, middleware };
}
