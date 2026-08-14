import { describe, it, expect } from "vitest";
import { createCSPMiddleware } from "../../package/core/securities/security/headers/content-security-policy/csp.middleware";

describe('CSP Middleware', () => {
  it('should apply default CSP headers', () => {
    const middleware = createCSPMiddleware(true);
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => { headers[k] = v; } };

    middleware({}, res, () => {});
    expect(headers['Content-Security-Policy']).toContain("default-src 'self'");
  });
});