/**
 * @fileoverview Header append service for subatom response.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ServerResponse } from "node:http";
import { setHeader } from "./setHeader.service.js";

export function appendHeader(
	raw: ServerResponse,
	headersMap: Map<string, string | string[]>,
	headersSent: boolean,
	name: string,
	value: string | string[],
): void {
	const existing = headersMap.get(name.toLowerCase());
	const incoming = Array.isArray(value) ? value : [value];

	if (existing === undefined) {
		setHeader(
			raw,
			headersMap,
			headersSent,
			name,
			incoming.length === 1 ? incoming[0] : incoming,
		);
		return;
	}

	const merged = Array.isArray(existing) ? [...existing] : [existing];
	merged.push(...incoming);
	setHeader(raw, headersMap, headersSent, name, merged);
}
