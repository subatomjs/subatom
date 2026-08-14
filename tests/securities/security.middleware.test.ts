import { describe, it, expect } from "vitest";
import { subatomSecurity } from '../../package/core/securities/security/security.middleware.js';

describe('Subatom Orchestrator Middleware', () => {
  it('should apply all default headers properly in stack', () => {
    const middleware = subatomSecurity();
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => { headers[k] = v; } };

    let called = false;
    middleware({}, res, () => { called = true; });

    expect(called).toBe(true);
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('SAMEORIGIN');
  });
});