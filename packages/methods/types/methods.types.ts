/**
 * @fileoverview type interface for all subatom native methods.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export interface SlugOptions {
	/** Character(s) used to join words. Defaults to '-'. */
	separator?: string;
	/** Lowercase the result. Defaults to true. */
	lowercase?: boolean;
	/** Truncate the result to this many characters. */
	maxLength?: number;
}

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

export interface RandomFn {
	/**
	 * Generate a random number. If both bounds are integers, returns a
	 * cryptographically-strong random integer in [min, max] (inclusive).
	 * Otherwise returns a random float in [min, max).
	 */
	(min?: number, max?: number): number;

	/** Random integer in [min, max], inclusive on both ends. */
	int(min: number, max: number): number;

	/** Random alphanumeric (or custom charset) string of the given length. */
	string(length?: number, charset?: string): string;

	/** Random boolean, optionally weighted by `probability` of returning true. */
	bool(probability?: number): boolean;

	/** Pick a random element from a non-empty array. */
	item<T>(arr: readonly T[]): T;

	/** Return a new array with elements shuffled (Fisher–Yates). */
	shuffle<T>(arr: readonly T[]): T[];
}
