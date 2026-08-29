/**
 * @fileoverview Make data dendable format, helper service for subatom response.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ServerResponse } from "node:http";
import { setHeader } from "./setHeader.service.js";

export function sendBody(
	raw: ServerResponse,
	headersMap: Map<string, string | string[]>,
	headersSent: boolean,
	body?: string | Buffer | Uint8Array | object,
	onJsonDelegate?: (data: object) => void,
): void {
	if (raw.writableEnded) return;

	if (body === undefined || body === null) {
		raw.end();
		return;
	}

	if (
		typeof body === "object" &&
		!(body instanceof Buffer) &&
		!(body instanceof Uint8Array)
	) {
		if (onJsonDelegate) onJsonDelegate(body);
		return;
	}

	if (typeof body === "string" && !headersMap.has("content-type")) {
		setHeader(
			raw,
			headersMap,
			headersSent,
			"Content-Type",
			"text/html; charset=utf-8",
		);
	}

	const length =
		body instanceof Buffer
			? body.length
			: body instanceof Uint8Array
				? body.byteLength
				: Buffer.byteLength(body as string);

	setHeader(raw, headersMap, headersSent, "Content-Length", length.toString());
	raw.end(body);
}
