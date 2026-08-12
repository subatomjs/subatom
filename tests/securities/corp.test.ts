import { describe, it, expect } from "vitest";
import { createCORPMiddleware } from "../../subatom/core/securities/security/headers/cross-origin-resource-policy/corp.middleware";

describe('CORP Middleware', () => {
  it('should set same-origin policy', () => {
    const middleware = createCORPMiddleware(true);
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => { headers[k] = v; } };

    middleware({}, res, () => {});
    expect(headers['Cross-Origin-Resource-Policy']).toBe('same-origin');
  });
});