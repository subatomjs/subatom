import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import WebSocket from "ws";
import type {
	IWebSocketConnection,
	WebSocketReadyState,
	WebSocketSendPayload,
} from "../../types/websocket/IWebSocket.js";
import type { ConnectionRegistry } from "./services/connectionRegistry.service.js";
import { TokenBucket } from "./services/rateLimiter.service.js";

/**
 * High-performance, memory-safe wrapper around raw WebSocket instances.
 * Enforces backpressure checks, safe serialization, room management,
 * and strongly-typed params, query, and locals.
 */
export class WebSocketConnection<
	TParams extends Record<string, string | undefined> = Record<
		string,
		string | undefined
	>,
	TQuery extends Record<string, string | undefined> = Record<
		string,
		string | undefined
	>,
	TLocals extends Record<string, any> = Record<string, any>,
> implements IWebSocketConnection<TParams, TQuery, TLocals>
{
	public readonly id: string;
	public locals: TLocals = {} as TLocals;

	/** @internal Heartbeat liveness flag, flipped on receiving pong responses */
	public _isAlive = true;
	/** @internal Token-bucket inbound message rate limiter */
	public readonly _rateLimiter: TokenBucket;

	public readonly params: TParams;
	public readonly query: TQuery;
	public readonly path: string;
	public readonly ip: string;

	private readonly _rooms = new Set<string>();
	private readonly backpressureLimit: number;

	constructor(
		public readonly raw: WebSocket,
		public readonly request: IncomingMessage,
		private readonly registry: ConnectionRegistry,
		options: {
			maxMessagesPerSecond: number;
			backpressureLimitBytes?: number | undefined;
			params?: TParams | undefined;
			query?: TQuery | undefined;
			path?: string | undefined;
			id?: string | undefined;
		},
	) {
		this.id = options.id ?? randomUUID();
		this.params = options.params ?? ({} as TParams);
		this.query = options.query ?? ({} as TQuery);
		this.path = options.path ?? request.url ?? "/";
		this.backpressureLimit = options.backpressureLimitBytes ?? 1_048_576; // 1MB default

		const forwardedFor = request.headers["x-forwarded-for"];
		const clientIp = Array.isArray(forwardedFor)
			? forwardedFor[0]
			: typeof forwardedFor === "string"
				? forwardedFor.split(",")[0]?.trim()
				: undefined;

		this.ip = clientIp || request.socket.remoteAddress || "127.0.0.1";
		this._rateLimiter = new TokenBucket(
			options.maxMessagesPerSecond,
			options.maxMessagesPerSecond,
		);
	}

	public get rooms(): ReadonlySet<string> {
		return this._rooms;
	}

	public get readyState(): WebSocketReadyState {
		return this.raw.readyState as WebSocketReadyState;
	}

	public get bufferedAmount(): number {
		return this.raw.bufferedAmount;
	}

	private preparePayload(
		data: WebSocketSendPayload,
	): string | Buffer | Uint8Array | ArrayBuffer | null {
		if (
			typeof data === "string" ||
			Buffer.isBuffer(data) ||
			data instanceof Uint8Array ||
			data instanceof ArrayBuffer
		) {
			return data;
		}

		try {
			return JSON.stringify(data);
		} catch (err) {
			console.error(
				`[Subatom WS] Failed to serialize JSON payload for connection ${this.id}:`,
				(err as Error).message,
			);
			return null;
		}
	}

	public send(data: WebSocketSendPayload): boolean {
		if (this.raw.readyState !== WebSocket.OPEN) {
			return false;
		}

		if (this.raw.bufferedAmount > this.backpressureLimit) {
			return false;
		}

		const payload = this.preparePayload(data);
		if (payload === null) {
			return false;
		}

		try {
			this.raw.send(payload, (err) => {
				if (err) {
					console.error(
						`[Subatom WS] Send failed for connection ${this.id}:`,
						err.message,
					);
				}
			});
			return true;
		} catch (err) {
			console.error(
				`[Subatom WS] Send threw exception for connection ${this.id}:`,
				(err as Error).message,
			);
			return false;
		}
	}

	public sendAsync(data: WebSocketSendPayload): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			if (this.raw.readyState !== WebSocket.OPEN) {
				return reject(new Error("WebSocket is not open"));
			}

			if (this.raw.bufferedAmount > this.backpressureLimit) {
				return reject(new Error("Backpressure limit exceeded"));
			}

			const payload = this.preparePayload(data);
			if (payload === null) {
				return reject(new Error("Failed to serialize payload"));
			}

			try {
				this.raw.send(payload, (err) => {
					if (err) return reject(err);
					resolve();
				});
			} catch (err) {
				reject(err);
			}
		});
	}

	public sendJson(data: unknown): boolean {
		return this.send(data as WebSocketSendPayload);
	}

	public sendJsonAsync(data: unknown): Promise<void> {
		return this.sendAsync(data as WebSocketSendPayload);
	}

	public join(room: string): void {
		if (!room || typeof room !== "string") return;
		this._rooms.add(room);
		this.registry.joinRoom(room, this);
	}

	public leave(room: string): void {
		if (!room || typeof room !== "string") return;
		this._rooms.delete(room);
		this.registry.leaveRoom(room, this);
	}

	public leaveAll(): void {
		for (const room of Array.from(this._rooms)) {
			this.leave(room);
		}
	}

	public broadcast(
		room: string,
		data: WebSocketSendPayload,
		excludeSelf = false,
	): void {
		const members = this.registry.getRoom(room);
		for (const member of members.values()) {
			if (excludeSelf && member.id === this.id) continue;
			if (member.readyState === 1 /* WebSocket.OPEN */) {
				member.send(data);
			}
		}
	}

	public ping(data?: any): void {
		if (this.raw.readyState === WebSocket.OPEN) {
			try {
				this.raw.ping(data);
			} catch {
				this.terminate();
			}
		}
	}

	public pong(data?: any): void {
		if (this.raw.readyState === WebSocket.OPEN) {
			try {
				this.raw.pong(data);
			} catch {
				this.terminate();
			}
		}
	}

	public close(code = 1000, reason = ""): void {
		try {
			if (
				this.raw.readyState === WebSocket.CONNECTING ||
				this.raw.readyState === WebSocket.OPEN
			) {
				this.raw.close(code, reason);
			}
		} catch {
			this.terminate();
		}
	}

	public terminate(): void {
		try {
			this.raw.terminate();
		} catch {
			// Ignore termination errors if already destroyed
		}
	}
}