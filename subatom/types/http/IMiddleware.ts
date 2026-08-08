import type { NextFunction } from "../framework/pipeline/INext.js";
import type { IRequest } from "./IRequest.js";
import type { IResponse } from "./IResponse.js";

/**
 * A global or path-scoped middleware. Structurally identical to `IHandler`
 * (a route handler) — kept as a distinct name for readability at call
 * sites like `app.use(...)`.
 */
export type MiddlewareHandler = (
	req: IRequest,
	res: IResponse,
	next: NextFunction,
) => void | Promise<void>;

/**
 * An error-handling middleware, distinguished at runtime by arity (4
 * parameters) — see `Subatom.use()`'s `fn.length === 4` check. `err` is
 * `unknown`, not `Error`, since it may not have been normalized yet by
 * the time it reaches user-defined error middleware.
 */
export type ErrorMiddlewareHandler = (
	err: unknown,
	req: IRequest,
	res: IResponse,
	next: NextFunction,
) => void | Promise<void>;
