/**
 * @fileoverview Adds Download Options middleware, setting X-Download-Options: 
 * noopen to help prevent downloaded files from opening automatically.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */


import type { IRequest } from "../../core/http/request/types/request.types.js";
import type { IResponse } from "../../core/http/response/types/response.types.js";
import type { NextFunction } from "../../pipelines/next/types/nextFunction.types.js";
import { SECURITY_HEADERS } from "../security.constant.header.js";
import { setSecurityHeader } from "../security.utils.js";

export function createDownloadOptionsMiddleware(enabled: boolean = true) {
  return (_req: IRequest, res: IResponse, next: NextFunction) => {
    if (enabled) {
      setSecurityHeader(res, SECURITY_HEADERS.X_DOWNLOAD_OPTIONS, "noopen");
    }
    next();
  };
}
