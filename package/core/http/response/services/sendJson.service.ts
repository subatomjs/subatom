import type { ServerResponse } from "node:http";
import { SubatomError } from "../../errors/Error.js";
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
	} catch (stringifyError: any) {
		throw new SubatomError(
			`Failed to serialize JSON response: ${stringifyError.message}`,
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
