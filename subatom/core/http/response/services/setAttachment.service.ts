import type { ServerResponse } from "node:http";
import { assertNoHeaderInjection, setHeader } from "./setHeader.service.js";

function encodeRfc5987(value: string): string {
	return encodeURIComponent(value)
		.replace(/['()]/g, escape)
		.replace(/\*/g, "%2A");
}

function toAsciiFallback(value: string): string {
	return value.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
}

export function setAttachment(
	raw: ServerResponse,
	headersMap: Map<string, string | string[]>,
	headersSent: boolean,
	filename?: string,
): void {
	if (!filename) {
		setHeader(
			raw,
			headersMap,
			headersSent,
			"Content-Disposition",
			"attachment",
		);
		return;
	}

	assertNoHeaderInjection("Content-Disposition", filename);
	const asciiName = toAsciiFallback(filename);
	const encodedName = encodeRfc5987(filename);

	setHeader(
		raw,
		headersMap,
		headersSent,
		"Content-Disposition",
		`attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
	);
}
