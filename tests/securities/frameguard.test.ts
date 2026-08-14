import { describe, it, expect } from "vitest";
import { createFrameguardMiddleware } from "../../package/core/securities/security/headers/frameguard/frameguard.middleware";

describe('Frameguard Middleware', () => {
  it('should apply SAMEORIGIN by default', () => {
    const middleware = createFrameguardMiddleware(true);
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => { headers[k] = v; } };

    middleware({}, res, () => {});
    expect(headers['X-Frame-Options']).toBe('SAMEORIGIN');
  });
});