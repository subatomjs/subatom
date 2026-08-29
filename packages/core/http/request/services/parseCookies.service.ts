/**
 * @fileoverview responsible to parse cookie, from string, string[], undefined, to object.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

export function parseCookies(
	cookieHeader: string | string[] | undefined,
): Record<string, string> {
	if (!cookieHeader || typeof cookieHeader !== "string") {
		return {};
	}

	const cookies: Record<string, string> = {};
	const pairs = cookieHeader.split(";");

	for (const pair of pairs) {
		const index = pair.indexOf("=");
		if (index > 0) {
			const key = pair.substring(0, index).trim();
			const val = pair.substring(index + 1).trim();
			try {
				cookies[key] = decodeURIComponent(val);
			} catch {
				cookies[key] = val;
			}
		}
	}

	return cookies;
}
