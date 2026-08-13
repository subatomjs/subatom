import { NextFunction } from "../../../types/framework/pipeline/INext.js";
import { IRequest } from "../../../types/http/IRequest.js";
import { IResponse } from "../../../types/http/IResponse.js";
import { ICorsOptions, CorsMiddleware } from "../../../types/securities/ICors.js";
import { normalizeHeaderValue, resolveOrigin } from "./utils.js";

const DEFAULT_OPTIONS: ICorsOptions = {
  origin: "*",
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
  allowedHeaders: [],
  exposedHeaders: [],
  credentials: false,
  optionsSuccessStatus: 204,
  preflightContinue: false,
};

export function createCors(options: ICorsOptions = {}): CorsMiddleware {
  const opts: ICorsOptions = { ...DEFAULT_OPTIONS, ...options };

  return async (
    req: IRequest,
    res: IResponse,
    next: NextFunction,
  ): Promise<void> => {
    const requestOrigin = (req.raw?.headers?.["origin"] ||
      (req as Record<string, any>).headers?.["origin"]) as string | undefined;
    const method = (
      req.raw?.method ||
      (req as Record<string, any>).method ||
      "GET"
    ).toUpperCase();

    // Use native res.vary() provided by IResponse contract
    if (requestOrigin) {
      res.vary("Origin");
    }

    if (!requestOrigin) {
      await next();
      return;
    }

    // 1. Resolve Origin
    const allowedOrigin = await resolveOrigin(requestOrigin, opts.origin);

    if (allowedOrigin) {
      if (allowedOrigin === "*") {
        // Spec restriction: Cannot use '*' when credentials are true
        if (opts.credentials) {
          res.setHeader("Access-Control-Allow-Origin", requestOrigin);
        } else {
          res.setHeader("Access-Control-Allow-Origin", "*");
        }
      } else if (typeof allowedOrigin === "string") {
        res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      } else if (allowedOrigin === true) {
        res.setHeader("Access-Control-Allow-Origin", requestOrigin);
      }
    }

    // 2. Credentials
    if (opts.credentials === true) {
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    // 3. Exposed Headers
    if (opts.exposedHeaders) {
      const exposed = normalizeHeaderValue(opts.exposedHeaders);
      if (exposed) {
        res.setHeader("Access-Control-Expose-Headers", exposed);
      }
    }

    // 4. Preflight Request Handler
    if (method === "OPTIONS") {
      // Allowed Methods
      if (opts.methods) {
        res.setHeader(
          "Access-Control-Allow-Methods",
          normalizeHeaderValue(opts.methods),
        );
      }

      // Allowed Headers
      const requestHeaders = (req.raw?.headers?.[
        "access-control-request-headers"
      ] ||
        (req as Record<string, any>).headers?.[
          "access-control-request-headers"
        ]) as string | undefined;

      const hasCustomAllowedHeaders = Array.isArray(opts.allowedHeaders)
        ? opts.allowedHeaders.length > 0
        : Boolean(opts.allowedHeaders);

      if (hasCustomAllowedHeaders) {
        res.setHeader(
          "Access-Control-Allow-Headers",
          normalizeHeaderValue(opts.allowedHeaders),
        );
      } else if (requestHeaders) {
        res.setHeader("Access-Control-Allow-Headers", requestHeaders);
        res.vary("Access-Control-Request-Headers");
      }

      // Max Age
      if (typeof opts.maxAge === "number" && opts.maxAge >= 0) {
        res.setHeader("Access-Control-Max-Age", opts.maxAge.toString());
      }

      if (opts.preflightContinue) {
        await next();
      } else {
        res.status(opts.optionsSuccessStatus ?? 204);
        res.end();
      }
      return;
    }

    await next();
  };
}
