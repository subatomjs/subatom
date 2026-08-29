/**
 * @fileoverview responsible for accepting request headers.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { IParsedAccept } from "../types/request.types.js";
import { getHeader } from "./getHeader.service.js";

/**
 * Checks if the request's Accept header matches a target content type.
 * Supports q-factors, wildcards (image), and header parameter stripping.
 */
export function acceptsHeader(
	headers: Record<string, string | string[] | undefined>,
	contentType: string,
): boolean {
	const acceptHeader = getHeader(headers, "accept");

	// Per RFC 7231: If no Accept header is present, the client accepts all media types (*/*)
	if (!acceptHeader) return true;

	const [targetType = "", targetSubtype = ""] = contentType
		.toLowerCase()
		.split("/");
	if (!targetType || !targetSubtype) return false;

	const parsedAccepts = parseAcceptTypes(acceptHeader);

	for (const accept of parsedAccepts) {
		// Skip types explicitly rejected by client (q=0)
		if (accept.q === 0) continue;

		// Exact match or full wildcard (*/*)
		if (accept.type === "*" && accept.subtype === "*") return true;

		// Matching main type and subtype OR wildcard subtype (e.g. image/* matching image/png)
		if (accept.type === targetType) {
			if (accept.subtype === "*" || accept.subtype === targetSubtype) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Helper to parse and extract MIME types and q-values from Accept header string
 */
export function parseAcceptTypes(acceptHeader: string): IParsedAccept[] {
	return acceptHeader.split(",").map((part) => {
		const [mimeAndParams] = part.split(";");
		const mime = (mimeAndParams || "").trim().toLowerCase();
		const [type = "*", subtype = "*"] = mime.split("/");

		// Extract q-value if present
		let q = 1.0;
		const qMatch = part.match(/;\s*q\s*=\s*([0-9.]+)/i);
		if (qMatch?.[1]) {
			const parsedQ = parseFloat(qMatch[1]);
			if (!Number.isNaN(parsedQ)) q = parsedQ;
		}

		return { type, subtype, q };
	});
}
