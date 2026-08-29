/**
 * @fileoverview Provides shared security utilities for environment detection, 
 * config normalization, secure header management, directive validation, and origin validation.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */



import type { IResponse } from "../core/http/response/types/response.types.js";
import { InvalidDirectiveError } from "../errors/SecurityErrors.js";

const VALID_ORIGIN_REGEX = /^([a-z0-9+-.]+:\/\/)?([^\s:/]+)(?::(\d+))?$/i;

// Is production function
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function normalizeSecurityConfig<T extends object>(
  defaultConfig: T,
  userConfig?: Partial<T> | boolean,
): T | false {
  if (userConfig === false) return false;
  if (userConfig === true || userConfig === undefined)
    return { ...defaultConfig };
  return { ...defaultConfig, ...userConfig };
}

export function setSecurityHeader(
  res: IResponse,
  name: string,
  value: string,
): void {
  if (!res || typeof res.setHeader !== "function") return;
  if (res.headersSent) return;

  if (Array.isArray(value)) {
    res.setHeader(name, value);
  } else {
    res.setHeader(name, String(value));
  }
}

export function removeSecurityHeader(
  res: IResponse,
  name: string,
): void {
  if (!res || typeof res.removeHeader !== "function") return;
  if (res.headersSent) return;

  res.removeHeader(name);
}

export function validateDirectiveName(name: string): void {
  if (!name || typeof name !== "string" || !/^[a-zA-Z0-9-]+$/.test(name)) {
    throw new InvalidDirectiveError(`Invalid directive name: "${name}"`);
  }
}

export function isValidOrigin(origin: string): boolean {
  if (
    origin === "'self'" ||
    origin === "'none'" ||
    origin === "*" ||
    origin === "'unsafe-inline'" ||
    origin === "'unsafe-eval'"
  ) {
    return true;
  }
  return VALID_ORIGIN_REGEX.test(origin);
}
