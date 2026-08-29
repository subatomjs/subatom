/**
 * @fileoverview This module is responsible for parsing HTTP Cookie request header strings
 * into key-value JavaScript objects.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export function parseCookieHeader(header?: string): Record<string, string> {
	const out: Record<string, string> = {};
	if (!header) return out;

	for (const part of header.split(";")) {
		const idx = part.indexOf("=");
		if (idx === -1) continue;
		const key = part.slice(0, idx).trim();
		const val = part.slice(idx + 1).trim();
		if (!key) continue;
		try {
			out[key] = decodeURIComponent(val);
		} catch {
			out[key] = val;
		}
	}

	return out;
}
