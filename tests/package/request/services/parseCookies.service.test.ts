// tests/services/parseCookies.service.test.ts
import { describe, expect, it } from "vitest";
import { parseCookies } from "../../../../package/core/http/request/services/parseCookies.service.js";

describe("parseCookies service", () => {
    it("should return empty object on missing or non-string input", () => {
        expect(parseCookies(undefined)).toEqual({});
        expect(parseCookies(["cookie1=val"] as any)).toEqual({});
        expect(parseCookies("")).toEqual({});
    });

    it("should parse and URI-decode valid semicolon-delimited cookie strings", () => {
        const rawCookie = "session_id=s%3A12345; theme=dark; token=abc%3D%3D";
        const parsed = parseCookies(rawCookie);
        expect(parsed).toEqual({
            session_id: "s:12345",
            theme: "dark",
            token: "abc==",
        });
    });

    it("should fallback to raw string if decodeURIComponent throws on malformed encoding", () => {
        const malformed = "malformed=%E0%A4%A; regular=val";
        const parsed = parseCookies(malformed);
        expect(parsed.malformed).toBe("%E0%A4%A");
        expect(parsed.regular).toBe("val");
    });

    it("should ignore invalid pairs without equals signs or empty keys", () => {
        const invalid = "=emptyKey; noEquals; valid=123";
        const parsed = parseCookies(invalid);
        expect(parsed).toEqual({ valid: "123" });
    });
});