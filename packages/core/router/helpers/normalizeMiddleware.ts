/**
 * @fileoverview Normalizes context and legacy middleware into a
 * unified internal handler, adapting request/response or
 * context-based middleware to Subatom’s pipeline.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { getOrCreateContext } from "../../../context/Context.js";
import type { NextFunction } from "../../../pipelines/next/types/nextFunction.types.js";
import type { IRequest } from "../../http/request/types/request.types.js";
import type { IResponse } from "../../http/response/types/response.types.js";
import type {
	IContextMiddleware,
	IHandler,
	ILegacyHandler,
	IRouteMiddleware,
} from "../types/router.types.js";

/**
 * Adapts context middlewares or legacy request/response handlers to an internal IHandler.
 */
function normalizeMiddlewareToHandler(mw: IRouteMiddleware): IHandler {
	return async (req: IRequest, res: IResponse, next: NextFunction) => {
		if (mw.length >= 3 || "_fileConfig" in (mw as object)) {
			return (mw as ILegacyHandler<IRequest, IResponse>)(req, res, next);
		}
		const ctx = getOrCreateContext(req, res);
		return (mw as IContextMiddleware)(ctx, next);
	};
}
export default normalizeMiddlewareToHandler;
