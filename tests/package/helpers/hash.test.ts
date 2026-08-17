import { createHash, createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { hash } from "../../../package/core/helpers/framework/hash.js";

describe("Hash Utility", () => {
    describe("hash()", () => {
        it("computes default SHA-256 hex digest for string input", () => {
            const input = "test-data";
            const expected = createHash("sha256").update(input).digest("hex");
            expect(hash(input)).toBe(expected);
        });

        it("computes hash from Buffer input", () => {
            const buffer = Buffer.from("buffer-payload", "utf-8");
            const expected = createHash("sha256").update(buffer).digest("hex");
            expect(hash(buffer)).toBe(expected);
        });

        it("supports custom algorithms (md5, sha1, sha512)", () => {
            const input = "multi-algo-test";

            expect(hash(input, { algorithm: "md5" })).toBe(
                createHash("md5").update(input).digest("hex"),
            );
            expect(hash(input, { algorithm: "sha1" })).toBe(
                createHash("sha1").update(input).digest("hex"),
            );
            expect(hash(input, { algorithm: "sha512" })).toBe(
                createHash("sha512").update(input).digest("hex"),
            );
        });

        it("supports custom output encodings (base64, hex)", () => {
            const input = "encoding-test";
            expect(hash(input, { encoding: "base64" })).toBe(
                createHash("sha256").update(input).digest("base64"),
            );
        });
    });

    describe("hash.password() and hash.verify()", () => {
        it("generates a formatted salt:derivedKey string and verifies valid password", () => {
            const plainPassword = "SuperSecretPassword123!";
            const hashedPassword = hash.password(plainPassword);

            expect(typeof hashedPassword).toBe("string");
            const parts = hashedPassword.split(":");
            expect(parts).toHaveLength(2);
            expect(parts[0]).toMatch(/^[0-9a-f]{32}$/); // 16 bytes = 32 hex chars
            expect(parts[1]).toMatch(/^[0-9a-f]{128}$/); // 64 bytes = 128 hex chars

            const isValid = hash.verify(plainPassword, hashedPassword);
            expect(isValid).toBe(true);
        });

        it("generates unique salts and hashes for identical passwords", () => {
            const password = "SamePassword";
            const hash1 = hash.password(password);
            const hash2 = hash.password(password);

            expect(hash1).not.toBe(hash2);
            expect(hash.verify(password, hash1)).toBe(true);
            expect(hash.verify(password, hash2)).toBe(true);
        });

        it("returns false for incorrect password", () => {
            const hashedPassword = hash.password("correct-password");
            expect(hash.verify("wrong-password", hashedPassword)).toBe(false);
        });

        it("returns false for malformed hash strings", () => {
            expect(hash.verify("password", "malformedhashnostring")).toBe(false);
            expect(hash.verify("password", ":")).toBe(false);
            expect(hash.verify("password", "onlysalt:")).toBe(false);
            expect(hash.verify("password", ":onlyhash")).toBe(false);
        });

        it("supports custom keylen", () => {
            const password = "custom-keylen-password";
            const hashedPassword = hash.password(password, { keylen: 32 });
            const parts = hashedPassword.split(":");
            expect(parts[1]).toHaveLength(64); // 32 bytes = 64 hex chars

            expect(hash.verify(password, hashedPassword, 32)).toBe(true);
            expect(hash.verify(password, hashedPassword, 64)).toBe(false);
        });
    });

    describe("hash.hmac()", () => {
        it("generates valid HMAC with default sha256 algorithm", () => {
            const data = "payload-data";
            const secret = "app-signing-secret";
            const expected = createHmac("sha256", secret).update(data).digest("hex");

            expect(hash.hmac(data, secret)).toBe(expected);
        });

        it("generates valid HMAC with Buffer data and custom algorithm", () => {
            const buffer = Buffer.from("payload-bytes");
            const secret = "app-signing-secret";
            const expected = createHmac("sha512", secret).update(buffer).digest("hex");

            expect(hash.hmac(buffer, secret, "sha512")).toBe(expected);
        });
    });
});