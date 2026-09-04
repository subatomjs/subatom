/**
 * @fileoverview Detects whether a returned value is a context or HTTP instance,
 * preventing it from being automatically serialized as a response.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IRequest } from "../../http/request/types/request.types.js";
import type { IResponse } from "../../http/response/types/response.types.js";
import type { IContext } from "../types/router.types.js";

/**
 * Checks if a value is the Context or HTTP request/response object to avoid auto-serializing it.
 */
function isContextOrHttpInstance(
	val: unknown,
	ctx: IContext,
	req: IRequest,
	res: IResponse,
): boolean {
	return (
		val === ctx ||
		val === res ||
		val === req ||
		val === (ctx as IContext)?.req ||
		val === (ctx as IContext)?.res ||
		val === (req as IRequest)?.raw ||
		val === (res as IResponse)?.raw
	);
}

export default isContextOrHttpInstance;
