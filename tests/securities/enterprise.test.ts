import { describe, it, expect } from "vitest";
import { enterpriseProfile } from '../../subatom/core/securities/security/profiles/enterprise.profile.js';
import { subatomSecurity } from "../../subatom/core/securities/security/security.middleware";

describe('Enterprise Profile Test', () => {
  it('should enforce default-src none in CSP', () => {
    const middleware = subatomSecurity(enterpriseProfile);
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => { headers[k] = v; } };

    middleware({}, res, () => {});
    expect(headers['Content-Security-Policy']).toContain("default-src 'none'");
  });
});