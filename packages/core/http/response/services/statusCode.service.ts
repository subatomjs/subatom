/**
 * @fileoverview Set and send status code, service for subatom response object.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { ServerResponse } from "node:http";

export function setStatusCode(
	raw: ServerResponse,
	headersSent: boolean,
	code: number,
	currentCode: number,
): number {
	if (headersSent) {
		console.warn(
			"[Subatom Warning]: Cannot set status code after headers are sent.",
		);
		return currentCode;
	}
	raw.statusCode = code;
	return code;
}
