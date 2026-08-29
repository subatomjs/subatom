/**
 * @fileoverview Formats Server-Sent Events and comments according to the SSE standard,
 * safely handling multiline data, JSON payloads, and field sanitization.
 * @author Kunal Chandra Das <kunal@subatomjs.dev>
 * @copyright Copyright (c) 2026 Subatom - (Kunal Chandra Das).
 * @license MIT
 */

import type { SseEvent } from "../types/sse.types.js";

export function formatSSEEvent(event: SseEvent): string {
	let frame = "";
	if (event.id !== undefined)
		frame += `id: ${sanitizeField(String(event.id))}\n`;
	if (event.event !== undefined)
		frame += `event: ${sanitizeField(String(event.event))}\n`;
	if (event.retry !== undefined) frame += `retry: ${Number(event.retry)}\n`;

	const rawData = event.data;
	let payload: string;
	if (typeof rawData === "string") {
		payload = rawData;
	} else if (rawData === undefined) {
		payload = "";
	} else {
		try {
			payload = JSON.stringify(rawData) ?? "";
		} catch {
			payload = String(rawData);
		}
	}

	const normalizedPayload = payload.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	for (const line of normalizedPayload.split("\n")) {
		frame += `data: ${line}\n`;
	}
	return `${frame}\n`;
}

/** A `: comment\n\n` line - invisible to `onmessage`, doubles as a heartbeat. */
export function formatSSEComment(comment: string): string {
	return `: ${sanitizeField(comment)}\n\n`;
}

/** Strips newlines from single-line fields (id/event) to prevent field injection. */
function sanitizeField(value: string): string {
	return value.replace(/[\r\n]/g, "");
}
