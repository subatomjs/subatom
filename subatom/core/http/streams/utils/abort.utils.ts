import type { ServerResponse } from "node:http";

/**
 * Detects a premature client disconnect: the underlying connection closed
 * before `res.end()` completed the response. Guards against firing after
 * a normal finish, and against firing twice. Returns an unsubscribe fn.
 *
 * Node emits 'close' on the response in both the "client hung up" case
 * and the "we finished normally" case, so we gate on `writableEnded`.
 */
export function onClientDisconnect(
  raw: ServerResponse,
  callback: () => void,
): () => void {
  let fired = false;
  const handler = () => {
    if (fired || raw.writableEnded) return;
    fired = true;
    callback();
  };
  raw.on("close", handler);
  return () => raw.off("close", handler);
}

/**
 * Bridges an external AbortSignal into a callback, firing immediately if
 * the signal is already aborted (covers the "aborted before we even
 * started streaming" race). Returns an unsubscribe fn - always call it
 * once the stream settles to avoid leaking listeners on long-lived
 * signals (e.g. a shared server-shutdown signal).
 */
export function bindAbortSignal(
  signal: AbortSignal | undefined,
  onAbort: () => void,
): () => void {
  if (!signal) return () => {};
  if (signal.aborted) {
    onAbort();
    return () => {};
  }
  const handler = () => onAbort();
  signal.addEventListener("abort", handler, { once: true });
  return () => signal.removeEventListener("abort", handler);
}