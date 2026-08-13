import type { ServerResponse } from "node:http";
import type { CookieOptions } from "../../../../types/http/IResponse.js";
import { assertNoHeaderInjection, setHeader } from "./setHeader.service.js";

export function setCookie(
	raw: ServerResponse,
	headersMap: Map<string, string | string[]>,
	headersSent: boolean,
	name: string,
	value: string,
	options: CookieOptions = {},
): void {
	assertNoHeaderInjection("Set-Cookie (name)", name);
	assertNoHeaderInjection("Set-Cookie (value)", value);

	const parts: string[] = [
		`${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
	];

	if (options.maxAge !== undefined) {
		parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
	}
	if (options.expires) {
		parts.push(`Expires=${options.expires.toUTCString()}`);
	}
	if (options.domain) {
		assertNoHeaderInjection("Set-Cookie (domain)", options.domain);
		parts.push(`Domain=${options.domain}`);
	}
	parts.push(`Path=${options.path || "/"}`);

	if (options.secure) {
		parts.push("Secure");
	}
	if (options.httpOnly ?? true) {
		parts.push("HttpOnly");
	}
	if (options.sameSite) {
		const sameSiteVal =
			typeof options.sameSite === "boolean" ? "Strict" : options.sameSite;
		parts.push(`SameSite=${sameSiteVal}`);
	}

	const cookieString = parts.join("; ");
	const existing = headersMap.get("set-cookie");

	if (Array.isArray(existing)) {
		setHeader(raw, headersMap, headersSent, "Set-Cookie", [
			...existing,
			cookieString,
		]);
	} else if (existing) {
		setHeader(raw, headersMap, headersSent, "Set-Cookie", [
			existing,
			cookieString,
		]);
	} else {
		setHeader(raw, headersMap, headersSent, "Set-Cookie", cookieString);
	}
}

export function clearCookie(
	raw: ServerResponse,
	headersMap: Map<string, string | string[]>,
	headersSent: boolean,
	name: string,
	options: CookieOptions = {},
): void {
	const { maxAge, ...cookieOptions } = options;
	setCookie(raw, headersMap, headersSent, name, "", {
		...cookieOptions,
		expires: new Date(0),
	});
}
