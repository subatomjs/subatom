import type { ServerResponse } from "node:http";
import type {
	SSEEvent,
	SSEOptions,
} from "../../../types/websocket/IServerSendEvents.js";
import { onClientDisconnect } from "../../http/streams/utils/abort.utils.js";
import { writeWithBackpressure } from "../../http/streams/utils/backpressure.utils.js";
import { formatSSEComment, formatSSEEvent } from "./sse.utils.js";

export class SSEStream {
	private readonly raw: ServerResponse;
	private heartbeatTimer?: NodeJS.Timeout | undefined;
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
				"X-Accel-Buffering": "no",
				...options.headers,
			});
			raw.flushHeaders?.();
		}

		if (options.retry !== undefined) {
			this.enqueue(`retry: ${options.retry}\n\n`);
		}

		const heartbeatInterval = options.heartbeatInterval ?? 15000;
		if (heartbeatInterval > 0) {
			this.heartbeatTimer = setInterval(() => {
				this.comment("heartbeat").catch(() => {
					/* Disconnect cleanup handled by close listener */
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

	public send(event: SSEEvent): Promise<void> {
		return this.enqueue(formatSSEEvent(event));
	}

	public comment(text: string): Promise<void> {
		return this.enqueue(formatSSEComment(text));
	}

	public onClose(callback: () => void): () => void {
		if (this._closed) {
			callback();
			return () => {};
		}
		this.onCloseCallbacks.add(callback);
		return () => this.onCloseCallbacks.delete(callback);
	}

	public close(): void {
		if (this._closed) return;
		this._closed = true;
		if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
		this.unbindDisconnect();
		if (!this.raw.writableEnded) this.raw.end();
		for (const cb of this.onCloseCallbacks) cb();
		this.onCloseCallbacks.clear();
	}
}