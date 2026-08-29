/**
 * @fileoverview Json response send service for subatom response object.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ServerResponse } from "node:http";
import { SubatomError } from "../../../../errors/Errors.js";
import { sendBody } from "./sendBody.service.js";
import { setHeader } from "./setHeader.service.js";

export function sendJson(
	raw: ServerResponse,
	headersMap: Map<string, string | string[]>,
	headersSent: boolean,
	data: unknown,
): void {
	if (raw.writableEnded) return;

	let payload: string;
	try {
		payload = JSON.stringify(data);
	} catch (stringifyError: unknown) {
		throw new SubatomError(
			`Failed to serialize JSON response: ${(stringifyError as Error).message}`,
			{ statusCode: 500, errorCode: "JSON_SERIALIZATION_ERROR" },
		);
	}

	if (!headersMap.has("content-type")) {
		setHeader(
			raw,
			headersMap,
			headersSent,
			"Content-Type",
			"application/json; charset=utf-8",
		);
	}

	sendBody(raw, headersMap, headersSent, payload);
}
