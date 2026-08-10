// src/framework/http/response/ResponseHelper.ts

import { IResponse, IResponseHelper } from "../../../../types/http/IResponse.js";
import { HTTP_STATUS_REGISTRY } from "../services/helpers.service.js";


export class ResponseHelper {
  constructor(public readonly res: IResponse) {}
}

// Declaration merging: tells TypeScript "instances of ResponseHelper also
// have every member of IResponseHelper" — matching what the loop below
// actually attaches to the prototype at runtime. This line has zero
// runtime effect; it exists purely for the type checker.
export interface ResponseHelper extends IResponseHelper {}

// ---- Build all ~70 methods ONCE at module load, onto the shared prototype ----
for (const entry of HTTP_STATUS_REGISTRY.values()) {
  (ResponseHelper.prototype as any)[entry.message] = entry.isError
    ? function (this: ResponseHelper, messageOrError?: string | Error, details?: unknown) {
        const message =
          messageOrError instanceof Error
            ? messageOrError.message
            : messageOrError ?? entry.defaultMessage;

        return this.res.status(entry.code).json({
          success: false,
          message,
          ...(details !== undefined ? { details } : {}),
        });
      }
    : function (this: ResponseHelper, data?: unknown) {
        return this.res.status(entry.code).json({
          success: true,
          data,
        });
      };
}