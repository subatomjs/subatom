// subatom/subatom/core/websocket/sse/SSEStream.ts
import type { ServerResponse } from "node:http";
import { writeWithBackpressure } from "../../http/streams/utils/backpressure.utils.js";
import { onClientDisconnect } from "../../http/streams/utils/abort.utils.js";
import { formatSSEComment, formatSSEEvent } from "./sse.utils.js";
import type {
  SSEEvent,
  SSEOptions,
} from "../../../types/websocket/IServerSendEvents.js";

/**
 * Manages one Server-Sent Events connection: sends the SSE handshake
 * headers on construction, then exposes `.send()` / `.comment()` for
 * pushing events over the connection's lifetime, plus heartbeats and
 * disconnect cleanup.
 *
 * Writes are serialized through an internal queue so concurrent
 * `.send()` calls (e.g. from different async event sources) can't
 * interleave partial frames, and each write still respects backpressure
 * before the next is issued.
 */
export class SSEStream {
  private readonly raw: ServerResponse;
  private heartbeatTimer?: NodeJS.Timeout;
  private _closed = false;
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly unbindDisconnect: () => void;
  private readonly onCloseCallbacks = new Set<() => void>();

  constructor(raw: ServerResponse, options: SSEOptions = {}) {
    this.raw = raw;

    if (!raw.headersSent) {
      raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // Disable response buffering on nginx-fronted deployments so
        // events aren't held back waiting for a buffer to fill.
        "X-Accel-Buffering": "no",
        ...options.headers,
      });
    }

    if (options.retry !== undefined) {
      this.enqueue(`retry: ${options.retry}\n\n`);
    }

    const heartbeatInterval = options.heartbeatInterval ?? 15000;
    if (heartbeatInterval > 0) {
      this.heartbeatTimer = setInterval(() => {
        this.comment("heartbeat").catch(() => {
          /* connection already gone; close() below will run via 'close' listener */
        });
      }, heartbeatInterval);
      this.heartbeatTimer.unref?.();
    }

    this.unbindDisconnect = onClientDisconnect(raw, () => this.close());
  }

  get closed(): boolean {
    return this._closed;
  }

  private enqueue(chunk: string): Promise<void> {
    if (this._closed) return Promise.resolve();
    this.writeQueue = this.writeQueue
      .then(() => writeWithBackpressure(this.raw, chunk))
      .catch(() => {
        this.close();
      });
    return this.writeQueue;
  }

  /** Pushes one event to the client. Resolves once flushed (backpressure-aware). */
  send(event: SSEEvent): Promise<void> {
    return this.enqueue(formatSSEEvent(event));
  }

  /** Sends a comment line - invisible to the client's `onmessage`, doubles as a manual ping. */
  comment(text: string): Promise<void> {
    return this.enqueue(formatSSEComment(text));
  }

  /** Registers a callback fired exactly once when the connection closes (client or server initiated). */
  onClose(callback: () => void): () => void {
    if (this._closed) {
      callback();
      return () => {};
    }
    this.onCloseCallbacks.add(callback);
    return () => this.onCloseCallbacks.delete(callback);
  }

  /** Ends the connection. Idempotent - safe to call from a disconnect handler or explicitly. */
  close(): void {
    if (this._closed) return;
    this._closed = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.unbindDisconnect();
    if (!this.raw.writableEnded) this.raw.end();
    for (const cb of this.onCloseCallbacks) cb();
    this.onCloseCallbacks.clear();
  }
}
