import type { IncomingMessage } from "node:http";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveOrigin } from "../../../../../../packages/core/http/request/services/resolveOrigin.service.js";

describe("resolveOrigin", () => {
  const originalEnv = process.env.SUBATOM_DEFAULT_HOST;

  beforeEach(() => {
    delete process.env.SUBATOM_DEFAULT_HOST;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SUBATOM_DEFAULT_HOST = originalEnv;
    } else {
      delete process.env.SUBATOM_DEFAULT_HOST;
    }
  });

  it("should resolve plain HTTP and default localhost when headers and options are missing", () => {
    const raw = { socket: { encrypted: false } } as unknown as IncomingMessage;
    const origin = resolveOrigin(raw, {}, {}, false);

    expect(origin).toEqual({ protocol: "http", host: "localhost" });
  });

  it("should detect HTTPS when socket is encrypted", () => {
    const raw = { socket: { encrypted: true } } as unknown as IncomingMessage;
    const origin = resolveOrigin(raw, { host: "example.com" }, {}, false);

    expect(origin).toEqual({ protocol: "https", host: "example.com" });
  });

  it("should prioritize options.defaultHost and SUBATOM_DEFAULT_HOST over fallback", () => {
    const raw = { socket: {} } as unknown as IncomingMessage;
    expect(resolveOrigin(raw, {}, { defaultHost: "custom.internal" }, false).host).toBe(
      "custom.internal",
    );

    process.env.SUBATOM_DEFAULT_HOST = "env.internal";
    expect(resolveOrigin(raw, {}, {}, false).host).toBe("env.internal");
  });

  it("should resolve forwarded proto and host headers when trustProxy is true", () => {
    const raw = { socket: { encrypted: false } } as unknown as IncomingMessage;
    const headers = {
      "x-forwarded-proto": "https, http",
      "x-forwarded-host": "api.subatom.dev, proxy.internal",
      host: "internal-load-balancer",
    };

    const origin = resolveOrigin(raw, headers, {}, true);
    expect(origin).toEqual({
      protocol: "https",
      host: "api.subatom.dev",
    });
  });

  it("should handle array header values for forwarded headers", () => {
    const raw = { socket: { encrypted: false } } as unknown as IncomingMessage;
    const headers = {
      "x-forwarded-proto": ["https", "http"],
      "x-forwarded-host": ["api.subatom.dev"],
    };

    const origin = resolveOrigin(raw, headers, {}, true);
    expect(origin).toEqual({
      protocol: "https",
      host: "api.subatom.dev",
    });
  });

  it("should fall back when forwarded headers contain only empty commas or whitespace", () => {
    const raw = { socket: { encrypted: false } } as unknown as IncomingMessage;
    const headers = {
      "x-forwarded-proto": "   ",
      "x-forwarded-host": "",
      host: "backup.subatom.dev",
    };

    const origin = resolveOrigin(raw, headers, {}, true);
    expect(origin).toEqual({
      protocol: "http",
      host: "backup.subatom.dev",
    });
  });
});