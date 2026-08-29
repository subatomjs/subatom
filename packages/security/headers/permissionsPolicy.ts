/**
 * @fileoverview Implements Permissions Policy middleware and serialization, 
 * validating directives and generating the Permissions-Policy response header.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */



import type { IRequest } from "../../core/http/request/types/request.types.js";
import type { IResponse } from "../../core/http/response/types/response.types.js";
import type { NextFunction } from "../../pipelines/next/types/nextFunction.types.js";
import { SECURITY_HEADERS } from "../security.constant.header.js";
import {
  normalizeSecurityConfig,
  setSecurityHeader,
  validateDirectiveName,
} from "../security.utils.js";
import {
  defaultPermissionsPolicyConfig,
  type PermissionsPolicyConfig,
  type PermissionsPolicyDirectives,
} from "../types/header.types.js";

export const VALID_PERMISSIONS = new Set([
  "accelerometer",
  "ambient-light-sensor",
  "autoplay",
  "battery",
  "camera",
  "display-capture",
  "document-domain",
  "encrypted-media",
  "execution-while-not-rendered",
  "execution-while-out-of-viewport",
  "fullscreen",
  "geolocation",
  "gyroscope",
  "keyboard-map",
  "magnetometer",
  "microphone",
  "midi",
  "navigation-override",
  "payment",
  "picture-in-picture",
  "publickey-credentials-get",
  "screen-wake-lock",
  "sync-xhr",
  "usb",
  "web-share",
  "xr-spatial-tracking",
]);

// 1. Permission policy create middleware
export function createPermissionsPolicyMiddleware(
  options?: Partial<PermissionsPolicyConfig> | boolean,
) {
  const config = normalizeSecurityConfig(
    defaultPermissionsPolicyConfig,
    options,
  );
  if (!config)
    return (_req: IRequest, _res: IResponse, next: NextFunction) => next();

  const serialized = serializePermissionsPolicy(config.features || {});

  return (_req: IRequest, res: IResponse, next: NextFunction) => {
    if (serialized) {
      setSecurityHeader(res, SECURITY_HEADERS.PERMISSIONS_POLICY, serialized);
    }
    next();
  };
}

//2. Permission policy serializer.
export function serializePermissionsPolicy(
  features: PermissionsPolicyDirectives,
): string {
  const parts: string[] = [];

  for (const [feature, allowList] of Object.entries(features)) {
    validateDirectiveName(feature);
    if (!allowList) continue;

    if (allowList.length === 0) {
      parts.push(`${feature}=()`);
    } else {
      const formatted = allowList
        .map((item) => (item === "self" || item === "*" ? item : `"${item}"`))
        .join(" ");
      parts.push(`${feature}=(${formatted})`);
    }
  }

  return parts.join(", ");
}

