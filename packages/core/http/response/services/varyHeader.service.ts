/**
 * @fileoverview safely appending HTTP request header field names
 * to the outgoing Vary response header without duplicates.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ServerResponse } from "node:http";
import { setHeader } from "./setHeader.service.js";

export function varyHeader(
	raw: ServerResponse,
	headersMap: Map<string, string | string[]>,
	headersSent: boolean,
	field: string,
): void {
	const existing = headersMap.get("vary");
	const fields = new Set(
		(Array.isArray(existing) ? existing.join(",") : (existing ?? ""))
			.split(",")
			.map((f) => f.trim())
			.filter(Boolean),
	);
	fields.add(field);
	setHeader(
		raw,
		headersMap,
		headersSent,
		"Vary",
		Array.from(fields).join(", "),
	);
}
