/**
 * @fileoverview Validates a rate-limit specification and creates its middleware,
 * returning both for use in route groups.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { MiddlewareHandler } from "../../../../pipelines/pipeline.types.js";
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
