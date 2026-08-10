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