import { describe, it, expect } from "vitest";
import { createCOOPMiddleware } from "../../subatom/core/securities/security/headers/cross-origin-opener-policy/coop.middleware";

describe('COOP Middleware', () => {
  it('should set same-origin policy', () => {
    const middleware = createCOOPMiddleware(true);
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => { headers[k] = v; } };

    middleware({}, res, () => {});
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
  });
});