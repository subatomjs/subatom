import { describe, it, expect } from "vitest";
import { createReferrerPolicyMiddleware } from "../../package/core/securities/security/headers/referrer-policy";

describe('Referrer Policy Middleware', () => {
  it('should apply default no-referrer policy', () => {
    const middleware = createReferrerPolicyMiddleware(true);
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => { headers[k] = v; } };

    middleware({}, res, () => {});
    expect(headers['Referrer-Policy']).toBe('no-referrer');
  });
});