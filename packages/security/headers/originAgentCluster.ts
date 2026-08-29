/**
 * @fileoverview Adds Origin-Agent-Cluster middleware, enabling 
 * origin-based agent cluster isolation through the Origin-Agent-Cluster header.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */



import type { IRequest } from "../../core/http/request/types/request.types.js";
import type { IResponse } from "../../core/http/response/types/response.types.js";
import type { NextFunction } from "../../pipelines/next/types/nextFunction.types.js";
import { SECURITY_HEADERS } from "../security.constant.header.js";
import { setSecurityHeader } from "../security.utils.js";

export function createOriginAgentClusterMiddleware(enabled: boolean = true) {
  return (_req: IRequest, res: IResponse, next: NextFunction) => {
    if (enabled) {
      setSecurityHeader(res, SECURITY_HEADERS.ORIGIN_AGENT_CLUSTER, "?1");
    }
    next();
  };
}
