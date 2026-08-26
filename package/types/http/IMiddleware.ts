// subatom/package/types/http/IMiddleware.ts

import type { NextFunction } from "../framework/pipeline/INext.js";
import type { IRequest } from "./IRequest.js";
import type { IResponse } from "./IResponse.js";

/**
 * A global or path-scoped middleware.
 */
export type MiddlewareHandler = (
  req: IRequest,
  res: IResponse,
  next: NextFunction,
) => unknown | Promise<unknown>;

/**
 * An error-handling middleware.
 */
export type ErrorMiddlewareHandler = (
  err: unknown,
  req: IRequest,
  res: IResponse,
  next: NextFunction,
) => unknown | Promise<unknown>;