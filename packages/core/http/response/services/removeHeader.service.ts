/**
 * @fileoverview header remove service for subatom response.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

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
