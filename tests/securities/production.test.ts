import { describe, it, expect } from "vitest";
import { productionProfile } from '../../subatom/core/securities/security/profiles/production.profile.js';
import { subatomSecurity } from "../../subatom/core/securities/security/security.middleware";

describe('Production Profile Test', () => {
  it('should enforce strict max-age HSTS header', () => {
    const middleware = subatomSecurity(productionProfile);
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => { headers[k] = v; } };

    middleware({}, res, () => {});
    expect(headers['Strict-Transport-Security']).toContain('max-age=31536000');
  });
});