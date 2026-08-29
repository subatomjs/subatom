/**
 * @fileoverview Implements configurable Content Security Policy middleware, 
 * validating and serializing CSP directives into standard or report-only security headers.
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
import type {
  ContentSecurityPolicyConfig,
  ContentSecurityPolicyDirectives,
} from "../types/header.types.js";

// 1. Content Security Policy Config.
export const defaultContentSecurityPConfig: ContentSecurityPolicyConfig = {
  directives: {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "font-src": ["'self'", "https:", "data:"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'self'"],
    "img-src": ["'self'", "data:"],
    "object-src": ["'none'"],
    "script-src": ["'self'"],
    "script-src-attr": ["'none'"],
    "style-src": ["'self'", "https:", "'unsafe-inline'"],
    "upgrade-insecure-requests": true,
  },
  reportOnly: false,
};

// 1. Content Security Policy Directives.
export const VALID_CSP_DIRECTIVES = new Set([
  "child-src",
  "connect-src",
  "default-src",
  "font-src",
  "frame-src",
  "img-src",
  "manifest-src",
  "media-src",
  "object-src",
  "prefetch-src",
  "script-src",
  "script-src-elem",
  "script-src-attr",
  "style-src",
  "style-src-elem",
  "style-src-attr",
  "worker-src",
  "base-uri",
  "plugin-types",
  "sandbox",
  "disowned-opener",
  "form-action",
  "frame-ancestors",
  "navigate-to",
  "report-uri",
  "report-to",
  "block-all-mixed-content",
  "upgrade-insecure-requests",
]);

// Content security policy middleware 
export function createContentSecurityPolicyMiddleware(
  options?: Partial<ContentSecurityPolicyConfig> | boolean,
) {
  const config = normalizeSecurityConfig(
    defaultContentSecurityPConfig,
    options,
  );
  if (!config)
    return (_req: IRequest, _res: IResponse, next: NextFunction) => next();

  const serialized = serializeContentSecurityPolicy(config.directives || {});
  const headerName = config.reportOnly
    ? SECURITY_HEADERS.CSP_REPORT_ONLY
    : SECURITY_HEADERS.CSP;

  return (_req: IRequest, res: IResponse, next: NextFunction) => {
    if (serialized) {
      setSecurityHeader(res, headerName, serialized);
    }
    next();
  };
}

// Content security policy serializer.
export function serializeContentSecurityPolicy(
  directives: ContentSecurityPolicyDirectives,
): string {
  const result: string[] = [];

  for (const [key, val] of Object.entries(directives)) {
    validateDirectiveName(key);

    if (val === true) {
      result.push(key);
    } else if (Array.isArray(val) && val.length > 0) {
      result.push(`${key} ${val.join(" ")}`);
    }
  }

  return result.join("; ");
}
