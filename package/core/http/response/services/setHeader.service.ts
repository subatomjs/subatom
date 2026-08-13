import type { ServerResponse } from "node:http";
import { SubatomError } from "../../errors/Error.js";

const CRLF_PATTERN = /[\r\n]/;

export function assertNoHeaderInjection(name: string, value: string): void {
	if (CRLF_PATTERN.test(value)) {
		throw new SubatomError(
			`Refusing to set header "${name}": value contains CR/LF characters (possible header injection).`,
			{ statusCode: 500, errorCode: "HEADER_INJECTION_BLOCKED" },
		);
	}
}

export function setHeader(
	raw: ServerResponse,
	headersMap: Map<string, string | string[]>,
	headersSent: boolean,
	nameOrHeaders: string | Record<string, string | string[]>,
	value?: string | string[],
): void {
	if (headersSent) {
		console.warn(
			"[Subatom Warning]: Cannot set headers after they are sent to the client.",
		);
		return;
	}

	if (typeof nameOrHeaders === "string") {
		if (value === undefined) return;

		for (const v of Array.isArray(value) ? value : [value]) {
			assertNoHeaderInjection(nameOrHeaders, v);
		}

		headersMap.set(nameOrHeaders.toLowerCase(), value);
		raw.setHeader(nameOrHeaders, value);
		return;
	}

	for (const [key, val] of Object.entries(nameOrHeaders)) {
		setHeader(raw, headersMap, headersSent, key, val);
	}
}
