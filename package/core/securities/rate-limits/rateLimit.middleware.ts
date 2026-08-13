// src/rate-limit/rate-limit.middleware.ts
import { RateLimitOptions, normalizeConfig } from "./rateLimit.config.js";
import { RateLimitEngine } from "./rateLimit.engine.js";
import { applyHeaders } from "./headers.js";

export function createRateLimitMiddleware(options: RateLimitOptions) {
  const normalized = normalizeConfig(options);
  const engine = new RateLimitEngine(normalized);

  return async function rateLimitMiddleware(req: any, res: any, next: (err?: any) => void) {
    try {
      const decision = await engine.processRequest(req);
      applyHeaders(res, decision, normalized.headers);

      if (!decision.allowed) {
        if (normalized.onLimitExceeded) {
          normalized.onLimitExceeded(req, res, decision);
        }
        return res.status ? res.status(429).json({ error: "Too Many Requests", retryAfterMs: decision.resetMs }) : res.end();
      }

      return next();
    } catch (err: any) {
      if (normalized.onStoreError) normalized.onStoreError(err, req);

      if (normalized.failureMode === "fail-open") {
        return next();
      } else {
        return res.status ? res.status(500).json({ error: "Rate Limiter Failure" }) : res.end();
      }
    }
  };
}