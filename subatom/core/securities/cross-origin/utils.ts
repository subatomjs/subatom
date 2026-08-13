import { CorsOrigin } from "../../../types/securities/ICors.js";

export function normalizeHeaderValue(val?: string | string[]): string {
  if (Array.isArray(val)) {
    return val
      .map((item) => item.trim())
      .filter(Boolean)
      .join(",");
  }
  return val ? val.trim() : "";
}

export function isOriginAllowed(
  origin: string,
  allowedOrigin: string | RegExp,
): boolean {
  if (typeof allowedOrigin === "string") {
    return origin === allowedOrigin;
  }
  if (allowedOrigin instanceof RegExp) {
    return allowedOrigin.test(origin);
  }
  return false;
}

export async function resolveOrigin(
  requestOrigin: string | undefined,
  originConfig: CorsOrigin | undefined,
): Promise<string | boolean> {
  if (!requestOrigin || originConfig === undefined || originConfig === "*") {
    return originConfig === "*" ? "*" : false;
  }

  if (typeof originConfig === "boolean") {
    return originConfig;
  }

  if (typeof originConfig === "string") {
    return isOriginAllowed(requestOrigin, originConfig) ? requestOrigin : false;
  }

  if (originConfig instanceof RegExp) {
    return isOriginAllowed(requestOrigin, originConfig) ? requestOrigin : false;
  }

  if (Array.isArray(originConfig)) {
    const isMatch = originConfig.some((allowed) =>
      isOriginAllowed(requestOrigin, allowed),
    );
    return isMatch ? requestOrigin : false;
  }

  if (typeof originConfig === "function") {
    if (originConfig.length <= 1) {
      const result = await (
        originConfig as (origin?: string) => Promise<boolean>
      )(requestOrigin);
      return result ? requestOrigin : false;
    }

    return new Promise<string | boolean>((resolve) => {
      (originConfig as Function)(
        requestOrigin,
        (err: Error | null, allow?: boolean) => {
          if (err || !allow) {
            resolve(false);
          } else {
            resolve(requestOrigin);
          }
        },
      );
    });
  }

  return false;
}
