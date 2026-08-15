import {
	createHash,
	createHmac,
	randomBytes,
	scryptSync,
	timingSafeEqual,
} from "crypto";

export type HashAlgorithm = "md5" | "sha1" | "sha256" | "sha512";
export type HashEncoding =
	| "base64"
	| "hex"
	| "latin1"
	| "utf8"
	| "utf-8"
	| "utf16le"
	| "ucs2";

export interface HashOptions {
	/** Digest algorithm to use. Defaults to 'sha256'. */
	algorithm?: HashAlgorithm;
	/** Output encoding. Defaults to 'hex'. */
	encoding?: HashEncoding;
}

export interface HashPasswordOptions {
	/** Length in bytes of the derived key. Defaults to 64. */
	keylen?: number;
}

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
