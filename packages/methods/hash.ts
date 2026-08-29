/**
 * @fileoverview subatom native method for hashing.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import {
	createHash,
	createHmac,
	randomBytes,
	scryptSync,
	timingSafeEqual,
} from "node:crypto";
import type {
	HashAlgorithm,
	HashOptions,
	HashPasswordOptions,
} from "./types/methods.types.js";

/**
 * Create a fast, one-way digest of the given input.
 *
 * NOT suitable for passwords or secrets — use `hash.password()` /
 * `hash.verify()` for those, since this is a plain unsalted digest.
 *
 * @example
 * hash('hello world')                                  // sha256 hex digest
 * hash('hello world', { algorithm: 'md5' })
 * hash(buffer, { encoding: 'base64' })
 */
export function hash(
	input: string | Buffer,
	options: HashOptions = {},
): string {
	const { algorithm = "sha256", encoding = "hex" } = options;
	return createHash(algorithm).update(input).digest(encoding);
}

/**
 * Hash a plaintext password using scrypt with a random per-hash salt.
 * Returns a single string of the form `salt:derivedKeyHex` that can be
 * stored directly and later checked with `hash.verify()`.
 */
hash.password = function password(
	plain: string,
	options: HashPasswordOptions = {},
): string {
	const { keylen = 64 } = options;
	const salt = randomBytes(16).toString("hex");
	const derivedKey = scryptSync(plain, salt, keylen);
	return `${salt}:${derivedKey.toString("hex")}`;
};

/**
 * Verify a plaintext password against a hash produced by `hash.password()`.
 * Uses a constant-time comparison to avoid timing attacks.
 */
hash.verify = function verify(
	plain: string,
	hashed: string,
	keylen = 64,
): boolean {
	const [salt, key] = hashed.split(":");
	if (!salt || !key) return false;

	const keyBuffer = Buffer.from(key, "hex");
	const derivedKey = scryptSync(plain, salt, keylen);

	return (
		keyBuffer.length === derivedKey.length &&
		timingSafeEqual(keyBuffer, derivedKey)
	);
};

/** Keyed hashing (HMAC) — useful for signing tokens, webhooks, etc. */
hash.hmac = function hmac(
	input: string | Buffer,
	secret: string,
	algorithm: HashAlgorithm = "sha256",
): string {
	return createHmac(algorithm, secret).update(input).digest("hex");
};
