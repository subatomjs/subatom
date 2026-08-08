import type { ServerResponse } from "node:http";

export function removeHeader(
	raw: ServerResponse,
	headersMap: Map<string, string | string[]>,
	headersSent: boolean,
	name: string,
): void {
	if (headersSent) {
		console.warn(
			`[Subatom Warning]: Cannot remove header "${name}" after headers are sent.`,
		);
		return;
	}
	headersMap.delete(name.toLowerCase());
	raw.removeHeader(name);
}
