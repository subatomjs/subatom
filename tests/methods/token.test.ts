import { describe, it, expect } from "vitest";
import {
	token,
	SubatomTokenError,
	SubatomTokenExpiredError,
} from "../../packages/methods/token.js";

describe("Subatom Enterprise Token Module", () => {
	const SECRET = "test-secret-key";
	const PAYLOAD = { userId: "123", role: "admin" };

	describe("sign()", () => {
		it("should sign a token with default options (HS256, 15m)", () => {
			const signedToken = token.sign(PAYLOAD, SECRET);
			expect(typeof signedToken).toBe("string");
			expect(signedToken.split(".")).toHaveLength(3);
		});

		it("should allow developer to customize algorithm and options", () => {
			const signedToken = token.sign(PAYLOAD, SECRET, {
				algorithm: "HS512",
				expiresIn: "1h",
			});
			const decoded = token.verify(signedToken, SECRET, {
				algorithms: ["HS512"],
			});
			expect(decoded).toMatchObject(PAYLOAD);
		});

		it("should throw SubatomTokenError when signing fails with invalid input/secret", () => {
			// Passing an invalid secret type to force failure
			// biome-ignore lint/suspicious/noExplicitAny: explanation
			expect(() => token.sign(PAYLOAD, null as any)).toThrow(SubatomTokenError);
		});
	});

	describe("verify()", () => {
		it("should successfully verify a valid token", () => {
			const signedToken = token.sign(PAYLOAD, SECRET);
			const verified = token.verify<typeof PAYLOAD>(signedToken, SECRET);
			expect(verified.userId).toBe(PAYLOAD.userId);
			expect(verified.role).toBe(PAYLOAD.role);
		});

		it("should throw SubatomTokenExpiredError when token is expired", () => {
			// Create an already expired token
			const expiredToken = token.sign(PAYLOAD, SECRET, { expiresIn: "-1s" });

			expect(() => token.verify(expiredToken, SECRET)).toThrow(
				SubatomTokenExpiredError,
			);
		});

		it("should throw SubatomTokenError on invalid signature / jsonwebtoken error", () => {
			const signedToken = token.sign(PAYLOAD, SECRET);
			expect(() => token.verify(signedToken, "wrong-secret")).toThrow(
				SubatomTokenError,
			);
		});

		it("should throw SubatomTokenError on malformed token string", () => {
			expect(() => token.verify("malformed.token.string", SECRET)).toThrow(
				SubatomTokenError,
			);
		});
	});

	describe("decode() & isExpired()", () => {
		it("should decode token payload without secret", () => {
			const signedToken = token.sign(PAYLOAD, SECRET);
			const decoded = token.decode<typeof PAYLOAD>(signedToken);
			expect(decoded?.userId).toBe(PAYLOAD.userId);
		});

		it("should return null when decoding invalid token", () => {
			const decoded = token.decode("invalid-token");
			expect(decoded).toBeNull();
		});

		it("should return true for expired token via isExpired()", () => {
			const expiredToken = token.sign(PAYLOAD, SECRET, { expiresIn: "-1s" });
			expect(token.isExpired(expiredToken)).toBe(true);
		});

		it("should return false for valid unexpired token via isExpired()", () => {
			const validToken = token.sign(PAYLOAD, SECRET, { expiresIn: "10m" });
			expect(token.isExpired(validToken)).toBe(false);
		});

		it("should return true for malformed token via isExpired()", () => {
			expect(token.isExpired("bad-token")).toBe(true);
		});
	});

	describe("pair()", () => {
		it("should generate both access and refresh tokens with default options", () => {
			const tokens = token.pair(PAYLOAD, "access-secret", "refresh-secret");
			expect(tokens.accessToken).toBeDefined();
			expect(tokens.refreshToken).toBeDefined();
		});

		it("should allow customized options for pair tokens", () => {
			const tokens = token.pair(
				PAYLOAD,
				"access-secret",
				"refresh-secret",
				{ expiresIn: "5m" },
				{ expiresIn: "1d" },
			);
			expect(tokens.accessToken).toBeDefined();
			expect(tokens.refreshToken).toBeDefined();
		});
	});

	describe("extractFromHeader()", () => {
		it("should extract token successfully with default 'Bearer' scheme", () => {
			const rawToken = "eyJhbGciOi...";
			const header = `Bearer ${rawToken}`;
			expect(token.extractFromHeader(header)).toBe(rawToken);
		});

		it("should extract token with custom scheme", () => {
			const rawToken = "abc123xyz";
			const header = `Token ${rawToken}`;
			expect(token.extractFromHeader(header, "Token")).toBe(rawToken);
		});

		it("should return null if header is missing or empty", () => {
			expect(token.extractFromHeader(undefined)).toBeNull();
			expect(token.extractFromHeader("")).toBeNull();
		});

		it("should return null if scheme does not match", () => {
			expect(
				token.extractFromHeader("Basic dXNlcjpwYXNz", "Bearer"),
			).toBeNull();
		});

		it("should return null if token part is missing after scheme", () => {
			expect(token.extractFromHeader("Bearer ")).toBeNull();
		});
	});
});
