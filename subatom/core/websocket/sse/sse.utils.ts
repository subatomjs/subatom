// subatom/subatom/core/websocket/sse/sse.utils.ts
import { SSEEvent } from "../../../types/websocket/IServerSendEvents.js";


/**
 * Formats a single event per the SSE spec. Multi-line `data` payloads are
 * split across repeated `data:` lines, since a raw newline inside one
 * `data:` line would prematurely terminate the field.
 */
export function formatSSEEvent(event: SSEEvent): string {
  let frame = "";
  if (event.id !== undefined) frame += `id: ${sanitizeField(event.id)}\n`;
  if (event.event) frame += `event: ${sanitizeField(event.event)}\n`;
  if (event.retry !== undefined) frame += `retry: ${event.retry}\n`;

  const payload =
    typeof event.data === "string" ? event.data : JSON.stringify(event.data);
  for (const line of payload.split("\n")) {
    frame += `data: ${line}\n`;
  }
  return frame + "\n";
}

/** A `: comment\n\n` line - invisible to `onmessage`, useful as a heartbeat/ping. */
export function formatSSEComment(comment: string): string {
  return `: ${sanitizeField(comment)}\n\n`;
}

/** Strips newlines from single-line fields (id/event) to prevent field injection. */
function sanitizeField(value: string): string {
  return value.replace(/[\r\n]/g, "");
}