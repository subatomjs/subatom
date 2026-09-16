/**
 * @fileoverview Subatom enterprise native JWT module.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import jwt, {
	type SignOptions,
	type VerifyOptions,
	type DecodeOptions,
	type JwtPayload,
} from "jsonwebtoken";

// Extract errors safely from the default CJS export object
const {
	TokenExpiredError: JwtTokenExpiredError,
	JsonWebTokenError: JwtJsonWebTokenError,
	NotBeforeError: JwtNotBeforeError,
} = jwt;

// ==========================================
// 1. Types & Interfaces
// ==========================================

export interface TokenPair {
	accessToken: string;
	refreshToken: string;
}

export interface SubatomSignOptions extends SignOptions {}
export interface SubatomVerifyOptions extends VerifyOptions {}
export interface SubatomDecodeOptions extends DecodeOptions {}

// ==========================================
// 2. Custom Framework Errors (Enterprise DX)
// ==========================================

export class SubatomTokenError extends Error {
	// Explicitly declare cause to satisfy TypeScript inheritance rules
	override cause?: unknown;

	constructor(message: string, cause?: unknown) {
		super(message, { cause });
		this.name = "SubatomTokenError";
		this.cause = cause;
	}
}

export class SubatomTokenExpiredError extends SubatomTokenError {
	public readonly expiredAt: Date;

	constructor(expiredAt: Date) {
		super(`Token expired at ${expiredAt.toISOString()}`);
		this.name = "SubatomTokenExpiredError";
		this.expiredAt = expiredAt;
	}
}

// ==========================================
// 3. Core & Extended `token` Namespace
// ==========================================

export const token = {
	sign(
		payload: string | object | Buffer,
		secretOrPrivateKey: jwt.Secret,
		options: SubatomSignOptions = {},
	): string {
		try {
			const finalOptions: SubatomSignOptions = {
				algorithm: "HS256",
				expiresIn: "15m",
				...options,
			};
			return jwt.sign(payload, secretOrPrivateKey, finalOptions);
		} catch (error) {
			throw new SubatomTokenError("Failed to sign token", error);
		}
	},

	verify<T = JwtPayload>(
		tokenStr: string,
		secretOrPublicKey: jwt.Secret,
		options: SubatomVerifyOptions = {},
	): T {
		try {
			const finalOptions: SubatomVerifyOptions = {
				algorithms: ["HS256"],
				...options,
			};
			return jwt.verify(tokenStr, secretOrPublicKey, finalOptions) as T;
		} catch (error) {
			if (error instanceof JwtTokenExpiredError) {
				throw new SubatomTokenExpiredError(error.expiredAt);
			}
			if (
				error instanceof JwtJsonWebTokenError ||
				error instanceof JwtNotBeforeError
			) {
				throw new SubatomTokenError(error.message, error);
			}
			throw new SubatomTokenError("Token verification failed", error);
		}
	},

	decode<T = JwtPayload>(
		tokenStr: string,
		options: SubatomDecodeOptions = {},
	): T | null {
		try {
			return jwt.decode(tokenStr, options) as T | null;
		} catch {
			return null;
		}
	},

	isExpired(tokenStr: string): boolean {
		const decoded = jwt.decode(tokenStr) as JwtPayload | null;
		if (!decoded?.exp) return true;
		const currentTime = Math.floor(Date.now() / 1000);
		return decoded.exp < currentTime;
	},

	pair(
		payload: string | object | Buffer,
		accessSecret: jwt.Secret,
		refreshSecret: jwt.Secret,
		accessOptions: SubatomSignOptions = {},
		refreshOptions: SubatomSignOptions = {},
	): TokenPair {
		const accessToken = token.sign(payload, accessSecret, {
			expiresIn: "15m",
			...accessOptions,
		});
		const refreshToken = token.sign(payload, refreshSecret, {
			expiresIn: "7d",
			...refreshOptions,
		});
		return { accessToken, refreshToken };
	},

	extractFromHeader(
		authHeader?: string,
		scheme: string = "Bearer",
	): string | null {
		if (!authHeader) return null;
		const [type, tokenVal] = authHeader.split(" ");
		if (type !== scheme || !tokenVal) return null;
		return tokenVal;
	},
};
