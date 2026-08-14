import { describe, it, expect } from "vitest";
import { createPermissionsPolicyMiddleware } from "../../package/core/securities/security/headers/permissions-policy/permissions-policy.middleware";

describe('Permissions Policy Middleware', () => {
  it('should format permissions policy accurately', () => {
    const middleware = createPermissionsPolicyMiddleware(true);
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => { headers[k] = v; } };

    middleware({}, res, () => {});
    expect(headers['Permissions-Policy']).toContain('geolocation=()');
  });
});