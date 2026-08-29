/**
 * @fileoverview This module is responsible for serializing cookie key-value pairs
 *  and attributes into a standard HTTP Set-Cookie response header string.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export function serializeCookie(
	name: string,
	value: string,
	opts: {
		httpOnly?: boolean;
		secure?: boolean;
		maxAge?: number; // ms
		path?: string;
		domain?: string;
		sameSite?: boolean | "lax" | "strict" | "none";
		expires?: Date;
	} = {},
): string {
	let str = `${name}=${encodeURIComponent(value)}`;

	if (typeof opts.maxAge === "number") {
		str += `; Max-Age=${Math.floor(opts.maxAge / 1000)}`;
	}
	if (opts.domain) str += `; Domain=${opts.domain}`;
	str += `; Path=${opts.path ?? "/"}`;
	if (opts.expires) str += `; Expires=${opts.expires.toUTCString()}`;
	if (opts.httpOnly) str += "; HttpOnly";
	if (opts.secure) str += "; Secure";

	if (opts.sameSite) {
		const val =
			opts.sameSite === true
				? "Strict"
				: opts.sameSite.charAt(0).toUpperCase() + opts.sameSite.slice(1);
		str += `; SameSite=${val}`;
	}

	return str;
}
