import { describe, it, expect } from "vitest";
import { resolveKey } from "../../../../../package/core/securities/rate-limits/keys.js";

describe("RateLimit Key Resolver - resolveKey", () => {
    it("should resolve IP address from req.ip or socket fallback or default to 0.0.0.0", async () => {
        expect(await resolveKey({ ip: "192.168.1.10" }, "ip")).toBe("192.168.1.10");
        expect(
            await resolveKey({ socket: { remoteAddress: "10.0.0.1" } }, "ip"),
        ).toBe("10.0.0.1");
        expect(await resolveKey({}, "ip")).toBe("0.0.0.0");
    });

    it("should resolve authenticated user id or fallback to IP", async () => {
        expect(await resolveKey({ user: { id: "usr_123" } }, "user")).toBe("user:usr_123");
        expect(await resolveKey({ ip: "127.0.0.1" }, "user")).toBe("127.0.0.1");
    });

    it("should resolve and hash API keys from x-api-key or authorization headers, or fallback to IP", async () => {
        const reqWithHeader = { headers: { "x-api-key": "secret-key-12345" } };
        const resolved = await resolveKey(reqWithHeader, "api-key");
        expect(resolved.startsWith("apikey:")).toBe(true);
        expect(resolved).not.toContain("secret-key-12345"); // Ensures hashing

        const reqWithAuth = { headers: { authorization: "Bearer secret-token" } };
        const resolvedAuth = await resolveKey(reqWithAuth, "api-key");
        expect(resolvedAuth.startsWith("apikey:")).toBe(true);

        const reqWithoutKey = { headers: {}, ip: "1.2.3.4" };
        expect(await resolveKey(reqWithoutKey, "api-key")).toBe("1.2.3.4");
    });

    it("should produce deterministic hashes for identical API keys", async () => {
        const req1 = { headers: { "x-api-key": "identical_token" } };
        const req2 = { headers: { "x-api-key": "identical_token" } };
        const key1 = await resolveKey(req1, "api-key");
        const key2 = await resolveKey(req2, "api-key");
        expect(key1).toBe(key2);
    });

    it("should resolve tenant id or fallback to IP", async () => {
        expect(await resolveKey({ tenant: { id: "tenant_abc" } }, "tenant")).toBe("tenant:tenant_abc");
        expect(await resolveKey({ ip: "1.1.1.1" }, "tenant")).toBe("1.1.1.1");
    });

    it("should resolve route from baseUrl and path/url", async () => {
        expect(await resolveKey({ baseUrl: "/api/v1", path: "/users" }, "route")).toBe("route:/api/v1/users");
        expect(await resolveKey({ url: "/login" }, "route")).toBe("route:/login");
    });

    it("should resolve composite ip:path identifier", async () => {
        const req = { ip: "10.0.0.5", path: "/auth/login" };
        expect(await resolveKey(req, "composite")).toBe("10.0.0.5:/auth/login");

        const reqFallback = { socket: { remoteAddress: "127.0.0.1" }, url: "/submit" };
        expect(await resolveKey(reqFallback, "composite")).toBe("127.0.0.1:/submit");
    });

    it("should execute custom synchronous and asynchronous key resolver functions", async () => {
        const syncResolver = (req: any) => `custom:${req.headers["x-custom-id"]}`;
        expect(await resolveKey({ headers: { "x-custom-id": "org_99" } }, syncResolver)).toBe("custom:org_99");

        const asyncResolver = async (req: any) => `async:${req.query?.token}`;
        expect(await resolveKey({ query: { token: "tok_xyz" } }, asyncResolver)).toBe("async:tok_xyz");
    });

    it("should fallback to IP for unknown key type strings", async () => {
        expect(await resolveKey({ ip: "5.5.5.5" }, "unrecognized" as any)).toBe("5.5.5.5");
    });
});