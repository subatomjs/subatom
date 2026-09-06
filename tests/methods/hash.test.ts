/// <reference types="node" />
import { describe, test, expect } from "vitest";
import { hash } from "../../packages/methods/hash.js";

describe("hash utility", () => {
	describe("hash()", () => {
		test("generates sha256 hex digest by default", () => {
			const result = hash("hello world");
			expect(result).toBe(
				"b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
			);
		});

		test("supports custom algorithm and encoding", () => {
			const result = hash("hello world", {
				algorithm: "md5",
				encoding: "base64",
			});
			expect(typeof result).toBe("string");
			expect(result.length).toBeGreaterThan(0);
		});

		test("accepts Buffer inputs", () => {
			const buffer = Buffer.from("hello world", "utf-8");
			expect(hash(buffer)).toBe(
				"b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9",
			);
		});
	});

	describe("hash.password() & hash.verify()", () => {
		test("hashes password with default keylen and generates salt:key format", () => {
			const hashed = hash.password("secret123");
			const parts = hashed.split(":");
			expect(parts.length).toBe(2);
			expect(parts[0]?.length).toBe(32); // 16 bytes hex
			expect(parts[1]?.length).toBe(128); // 64 bytes hex
		});

		test("supports custom keylen option", () => {
			const hashed = hash.password("secret123", { keylen: 32 });
			const parts = hashed.split(":");
			expect(parts[1]?.length).toBe(64); // 32 bytes hex
		});

		test("verifies matching password correctly", () => {
			const password = "mySecurePassword!@#";
			const hashed = hash.password(password);
			expect(hash.verify(password, hashed)).toBe(true);
		});

		test("rejects mismatched password", () => {
			const hashed = hash.password("correctPassword");
			expect(hash.verify("wrongPassword", hashed)).toBe(false);
		});

		test("returns false when hashed input is malformed or missing parts", () => {
			expect(hash.verify("password", "")).toBe(false);
			expect(hash.verify("password", "onlySalt")).toBe(false);
			expect(hash.verify("password", ":missingSalt")).toBe(false);
		});

		test("returns false when derived key length mismatches stored key length", () => {
			const hashed = hash.password("secret", { keylen: 32 });
			// Verify with different keylen (default 64)
			expect(hash.verify("secret", hashed, 64)).toBe(false);
		});
	});

	describe("hash.hmac()", () => {
		test("generates valid HMAC with default sha256", () => {
			const secret = "app-secret";
			const hmac1 = hash.hmac("payload", secret);
			const hmac2 = hash.hmac(Buffer.from("payload"), secret);

			expect(typeof hmac1).toBe("string");
			expect(hmac1).toBe(hmac2);
		});

		test("supports custom algorithm", () => {
			const hmac = hash.hmac("payload", "secret", "sha512");
			expect(hmac.length).toBe(128); // 512 bit hex
		});
	});
});
