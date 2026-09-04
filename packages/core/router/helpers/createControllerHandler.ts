/**
 * @fileoverview Wraps controllers into internal route handlers,
 * managing context creation, response handling,
 * and error forwarding through the middleware pipeline.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import { getOrCreateContext } from "../../../context/Context.js";
import type { NextFunction } from "../../../pipelines/next/types/nextFunction.types.js";
import type { IRequest } from "../../http/request/types/request.types.js";
import type { IResponse } from "../../http/response/types/response.types.js";
import type {
	IController,
	IHandler,
	IRouteSchema,
} from "../types/router.types.js";
import isContextOrHttpInstance from "./httpInstanceDecider.js";

/**
 * Wraps a context controller into an internal IHandler.
 */
function createControllerHandler<
	TSchema extends IRouteSchema = IRouteSchema,
	TLocals extends Record<string, unknown> = Record<string, unknown>,
	TUser = unknown,
	TReturn = unknown,
>(controller: IController<TSchema, TLocals, TUser, TReturn>): IHandler {
	return async (req: IRequest, res: IResponse, next: NextFunction) => {
		if (res.writableEnded || res.headersSent) return;
		const ctx = getOrCreateContext<TSchema, TLocals, TUser>(req, res);
		try {
			const result = await controller(ctx);
			if (
				result !== undefined &&
				!res.writableEnded &&
				!res.headersSent &&
				!isContextOrHttpInstance(result, ctx, req, res)
			) {
				if (
					typeof result === "object" &&
					result !== null &&
					!(result instanceof Buffer) &&
					!(result instanceof Uint8Array)
				) {
					ctx.json(result);
				} else if (
					typeof result === "string" ||
					typeof result === "number" ||
					typeof result === "boolean"
				) {
					ctx.send(String(result));
				}
			}
		} catch (err) {
			return next(err);
		}
	};
}
export default createControllerHandler;
